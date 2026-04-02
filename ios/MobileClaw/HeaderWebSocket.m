#import "HeaderWebSocket.h"
#import <AVFoundation/AVFoundation.h>
#import <math.h>
#import <SpeechEngineToB/SpeechEngineToB-umbrella.h>

@interface HeaderWebSocket () <SpeechEngineDelegate>
@end

static NSNumber *MCConfigNumber(id value) {
    if ([value isKindOfClass:[NSNumber class]]) {
        return value;
    }
    if ([value isKindOfClass:[NSString class]]) {
        return @([(NSString *)value doubleValue]);
    }
    return nil;
}

@implementation HeaderWebSocket {
    NSURLSession *_session;
    NSURLSessionWebSocketTask *_wsTask;
    BOOL _hasListeners;
    AVAudioEngine *_audioEngine;
    AVAudioConverter *_audioConverter;
    dispatch_queue_t _audioQueue;
    BOOL _isAudioCapturing;
    SpeechEngine *_ttsEngine;
    NSDictionary *_ttsConfig;
    NSString *_ttsUID;
    NSString *_ttsDebugPath;
    NSString *_ttsStartPayload;
    NSString *_ttsPendingText;
    BOOL _ttsReady;
    BOOL _ttsSpeaking;
    BOOL _ttsPlaybackStarted;
    BOOL _ttsSessionFinished;
    BOOL _ttsStreamFinished;
}

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup { return YES; }

- (NSArray<NSString *> *)supportedEvents {
    return @[
        @"onOpen",
        @"onMessage",
        @"onError",
        @"onClose",
        @"onAudioData",
        @"onAudioCaptureError",
        @"onAudioCaptureStatus",
        @"onTTSStatus",
        @"onTTSError"
    ];
}

- (void)startObserving {
    _hasListeners = YES;
    if (!_audioQueue) {
        _audioQueue = dispatch_queue_create("com.kangarooking.mobileclaw.audio", DISPATCH_QUEUE_SERIAL);
    }
}

- (void)stopObserving  { _hasListeners = NO;   }

#pragma mark - Connect

RCT_REMAP_METHOD(connect,
                 url:(NSString *)url
                 headers:(NSDictionary *)headers
                 resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject)
{
    [self cleanup];

    NSURL *wsURL = [NSURL URLWithString:url];
    if (!wsURL) {
        reject(@"INVALID_URL", @"Invalid WebSocket URL", nil);
        return;
    }

    // Build session with custom HTTP headers
    NSMutableDictionary *httpHeaders = [NSMutableDictionary dictionary];
    if (headers) {
        for (NSString *key in headers) {
            id value = headers[key];
            if ([value isKindOfClass:[NSString class]]) {
                httpHeaders[key] = value;
            }
        }
    }

    NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
    config.HTTPAdditionalHeaders = httpHeaders;

    _session = [NSURLSession sessionWithConfiguration:config];
    _wsTask = [_session webSocketTaskWithURL:wsURL];
    [_wsTask resume];

    // Start receive loop on background thread
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        [self receiveLoop];
    });

    // Resolve after brief delay (handshake is async)
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        resolve(@(YES));
    });
}

#pragma mark - Receive Loop

- (void)receiveLoop {
    if (!_wsTask) return;

    [_wsTask receiveMessageWithCompletionHandler:^(NSURLSessionWebSocketMessage * _Nullable message,
                                                     NSError * _Nullable error) {
        if (error) {
            NSString *errMsg = error.localizedDescription ?: @"WebSocket receive error";
            if (_hasListeners) {
                [self sendEventWithName:@"onError"
                                   body:@{@"code": @(error.code), @"message": errMsg}];
            }
            if (error.code != NSURLErrorCancelled) {
                [self emitClose:error.code reason:errMsg];
            }
            return;
        }

        if (message != nil) {
            if (message.type == NSURLSessionWebSocketMessageTypeData) {
                NSData *data = message.data;
                NSMutableArray *bytes = [NSMutableArray arrayWithCapacity:data.length];
                const uint8_t *ptr = data.bytes;
                for (NSUInteger i = 0; i < data.length; i++) {
                    [bytes addObject:@(ptr[i])];
                }
                if (_hasListeners) {
                    [self sendEventWithName:@"onMessage" body:@{@"type": @"binary", @"data": bytes}];
                }
            } else if (message.type == NSURLSessionWebSocketMessageTypeString) {
                NSString *text = message.string ?: @"";
                if (_hasListeners) {
                    [self sendEventWithName:@"onMessage" body:@{@"type": @"text", @"data": text}];
                }
            }
        }

        [self receiveLoop];
    }];
}

#pragma mark - Send Data

RCT_REMAP_METHOD(sendData,
                 data:(NSArray<NSNumber *> *)dataArray
                 resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject)
{
    if (!_wsTask || _wsTask.state != NSURLSessionTaskStateRunning) {
        reject(@"NOT_CONNECTED", @"WebSocket not connected", nil);
        return;
    }

    NSUInteger len = dataArray.count;
    uint8_t *bytes = malloc(len);
    if (!bytes) {
        reject(@"MEMORY", @"Failed to allocate memory", nil);
        return;
    }

    for (NSUInteger i = 0; i < len; i++) {
        bytes[i] = [dataArray[i] unsignedCharValue];
    }

    NSData *nsData = [NSData dataWithBytesNoCopy:bytes length:len freeWhenDone:YES];
    NSURLSessionWebSocketMessage *msg = [[NSURLSessionWebSocketMessage alloc] initWithData:nsData];

    [_wsTask sendMessage:msg completionHandler:^(NSError * _Nullable error) {
        if (error) {
            reject(@"SEND_ERROR", error.localizedDescription ?: @"Send failed", nil);
        } else {
            resolve(@(YES));
        }
    }];
}

#pragma mark - Close

RCT_REMAP_METHOD(close,
                 resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject)
{
    [self cleanup];
    resolve(@(YES));
}

#pragma mark - Audio Capture

RCT_REMAP_METHOD(startAudioCapture,
                 startAudioCaptureResolve:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
    if (_isAudioCapturing) {
        resolve(@(YES));
        return;
    }

    if (!_audioQueue) {
        _audioQueue = dispatch_queue_create("com.kangarooking.mobileclaw.audio", DISPATCH_QUEUE_SERIAL);
    }

    [self stopAudioCaptureInternal];

    AVAudioSession *session = [AVAudioSession sharedInstance];
    NSError *error = nil;

    [self emitAudioStatus:@"start-requested" extra:nil];

    NSArray<AVAudioSessionPortDescription *> *availableInputs = session.availableInputs ?: @[];
    AVAudioSessionPortDescription *builtInMic = nil;
    for (AVAudioSessionPortDescription *input in availableInputs) {
        if ([input.portType isEqualToString:AVAudioSessionPortBuiltInMic]) {
            builtInMic = input;
            break;
        }
    }

    if (![session setCategory:AVAudioSessionCategoryPlayAndRecord
                         mode:AVAudioSessionModeMeasurement
                      options:(AVAudioSessionCategoryOptionDefaultToSpeaker |
                               AVAudioSessionCategoryOptionAllowBluetoothA2DP)
                        error:&error]) {
        reject(@"AUDIO_SESSION", error.localizedDescription ?: @"Failed to configure audio session", error);
        return;
    }

    [session setPreferredSampleRate:16000 error:nil];
    [session setPreferredIOBufferDuration:0.02 error:nil];
    if (builtInMic) {
        [session setPreferredInput:builtInMic error:nil];
    }

    if (![session setActive:YES error:&error]) {
        reject(@"AUDIO_SESSION", error.localizedDescription ?: @"Failed to activate audio session", error);
        return;
    }

    [self emitAudioStatus:@"session-active"
                    extra:@{
                        @"sampleRate": @(session.sampleRate),
                        @"inputAvailable": @(session.inputAvailable),
                        @"recordPermission": @((NSInteger)session.recordPermission),
                        @"availableInputs": @((NSInteger)availableInputs.count),
                        @"currentRouteInputs": @((NSInteger)session.currentRoute.inputs.count)
                    }];

    _audioEngine = [[AVAudioEngine alloc] init];
    AVAudioInputNode *inputNode = _audioEngine.inputNode;
    if (!inputNode) {
        reject(@"AUDIO_INPUT", @"No audio input node available", nil);
        return;
    }

    AVAudioFormat *inputFormat = [inputNode outputFormatForBus:0];
    [self emitAudioStatus:@"input-format"
                    extra:@{
                        @"sampleRate": @(inputFormat.sampleRate),
                        @"channels": @(inputFormat.channelCount)
                    }];
    AVAudioFormat *targetFormat =
      [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatInt16
                                       sampleRate:16000
                                         channels:1
                                      interleaved:YES];

    if (!targetFormat) {
        reject(@"AUDIO_FORMAT", @"Failed to create target PCM format", nil);
        return;
    }

    _audioConverter = [[AVAudioConverter alloc] initFromFormat:inputFormat toFormat:targetFormat];
    if (!_audioConverter) {
        reject(@"AUDIO_CONVERTER", @"Failed to create audio converter", nil);
        return;
    }

    __weak typeof(self) weakSelf = self;
    [inputNode removeTapOnBus:0];
    [inputNode installTapOnBus:0
                    bufferSize:2048
                        format:inputFormat
                         block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (!strongSelf || !strongSelf->_isAudioCapturing || !strongSelf->_audioQueue) {
            return;
        }

        dispatch_async(strongSelf->_audioQueue, ^{
            [strongSelf emitAudioStatus:@"tap-buffer"
                                  extra:@{@"frames": @(buffer.frameLength)}];
            [strongSelf emitPCMBuffer:buffer
                          inputFormat:inputFormat
                         targetFormat:targetFormat];
        });
    }];

    [_audioEngine prepare];
    if (![_audioEngine startAndReturnError:&error]) {
        [self stopAudioCaptureInternal];
        reject(@"AUDIO_ENGINE", error.localizedDescription ?: @"Failed to start audio engine", error);
        return;
    }

    _isAudioCapturing = YES;
    [self emitAudioStatus:@"engine-started" extra:nil];
    resolve(@(YES));
}

RCT_REMAP_METHOD(getAudioCaptureDebugInfo,
                 getAudioCaptureDebugInfoResolve:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
    AVAudioSession *session = [AVAudioSession sharedInstance];
    NSDictionary *result = @{
        @"isCapturing": @(_isAudioCapturing),
        @"engineExists": @(_audioEngine != nil),
        @"engineRunning": @(_audioEngine != nil ? _audioEngine.isRunning : NO),
        @"sampleRate": @(session.sampleRate),
        @"inputAvailable": @(session.inputAvailable),
        @"recordPermission": @((NSInteger)session.recordPermission),
        @"currentRouteInputs": @((NSInteger)session.currentRoute.inputs.count),
        @"currentRouteOutputs": @((NSInteger)session.currentRoute.outputs.count),
        @"availableInputs": @((NSInteger)(session.availableInputs ?: @[]).count),
    };
    resolve(result);
}

RCT_REMAP_METHOD(stopAudioCapture,
                 stopAudioCaptureResolve:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
    [self stopAudioCaptureInternal];
    resolve(@(YES));
}

#pragma mark - Doubao TTS

RCT_REMAP_METHOD(initializeDoubaoTTS,
                 initializeDoubaoTTS:(NSDictionary *)config
                 ttsResolve:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
    NSString *appId = [config[@"appId"] isKindOfClass:[NSString class]] ? config[@"appId"] : @"";
    NSString *accessToken = [config[@"accessToken"] isKindOfClass:[NSString class]] ? config[@"accessToken"] : @"";
    NSString *speaker = [config[@"voiceType"] isKindOfClass:[NSString class]] ? config[@"voiceType"] : @"";

    if (appId.length == 0 || accessToken.length == 0) {
        reject(@"TTS_CONFIG", @"Doubao TTS requires appId and accessToken", nil);
        return;
    }
    if (speaker.length == 0) {
        reject(@"TTS_CONFIG", @"Doubao TTS 2.0 requires voiceType (speaker)", nil);
        return;
    }

    NSError *error = nil;
    if (![self setupTTSEngineWithConfig:config error:&error]) {
        reject(@"TTS_INIT", error.localizedDescription ?: @"Failed to initialize Doubao TTS", error);
        return;
    }

    resolve(@(YES));
}

RCT_REMAP_METHOD(speakDoubaoTTS,
                 speakDoubaoTTS:(NSString *)text
                 speakResolve:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
    if (_ttsEngine == nil || !_ttsReady) {
        reject(@"TTS_NOT_READY", @"Doubao TTS is not initialized", nil);
        return;
    }

    NSString *trimmed = [text isKindOfClass:[NSString class]] ? [text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] : @"";
    if (trimmed.length == 0) {
        resolve(@(YES));
        return;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
        NSError *audioSessionError = nil;
        if (![self prepareTTSAudioSession:&audioSessionError]) {
            [self emitTTSError:[NSString stringWithFormat:@"Prepare TTS audio session failed: %@",
                                audioSessionError.localizedDescription ?: @"unknown"]
                          code:@(audioSessionError.code)];
            reject(@"TTS_AUDIO_SESSION",
                   audioSessionError.localizedDescription ?: @"Prepare TTS audio session failed",
                   audioSessionError);
            return;
        }

        [self->_ttsEngine sendDirective:SEDirectiveSyncStopEngine];
        [self resetTTSPlaybackState];
        self->_ttsSpeaking = YES;
        self->_ttsPendingText = [trimmed copy];
        NSMutableDictionary *status = [NSMutableDictionary dictionaryWithDictionary:[self currentAudioRouteInfo]];
        status[@"textLength"] = @(trimmed.length);
        [self emitTTSStatus:@"start-requested" extra:status];

        SEEngineErrorCode ret = [self->_ttsEngine sendDirective:SEDirectiveStartEngine
                                                           data:(self->_ttsStartPayload ?: @"")];
        if (ret != SENoError) {
            self->_ttsSpeaking = NO;
            self->_ttsPendingText = nil;
            [self emitTTSError:[NSString stringWithFormat:@"Start BiTTS engine failed: %d", ret]
                          code:@(ret)];
            reject(@"TTS_START", [NSString stringWithFormat:@"Start BiTTS engine failed: %d", ret], nil);
            return;
        }

        resolve(@(YES));
    });
}

RCT_REMAP_METHOD(stopDoubaoTTS,
                 stopDoubaoTTSResolve:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
    if (_ttsEngine != nil) {
        [_ttsEngine sendDirective:SEDirectiveSyncStopEngine];
    }
    [self resetTTSPlaybackState];
    resolve(@(YES));
}

RCT_REMAP_METHOD(destroyDoubaoTTS,
                 destroyDoubaoTTSResolve:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
    [self destroyTTSEngine];
    resolve(@(YES));
}

#pragma mark - Internal

- (BOOL)prepareTTSAudioSession:(NSError **)error {
    AVAudioSession *session = [AVAudioSession sharedInstance];

    if (![session setCategory:AVAudioSessionCategoryPlayAndRecord
                         mode:AVAudioSessionModeDefault
                      options:(AVAudioSessionCategoryOptionDefaultToSpeaker |
                               AVAudioSessionCategoryOptionAllowBluetooth |
                               AVAudioSessionCategoryOptionAllowBluetoothA2DP)
                        error:error]) {
        return NO;
    }

    if (![session setActive:YES error:error]) {
        return NO;
    }

    [session overrideOutputAudioPort:AVAudioSessionPortOverrideSpeaker error:nil];
    return YES;
}

- (NSDictionary *)currentAudioRouteInfo {
    AVAudioSession *session = [AVAudioSession sharedInstance];
    NSString *output = session.currentRoute.outputs.firstObject.portType ?: @"unknown";
    NSString *input = session.currentRoute.inputs.firstObject.portType ?: @"unknown";

    return @{
        @"output": output,
        @"input": input,
        @"sampleRate": @(session.sampleRate),
        @"outputCount": @((NSInteger)session.currentRoute.outputs.count),
        @"inputCount": @((NSInteger)session.currentRoute.inputs.count)
    };
}

- (void)cleanup {
    @synchronized (self) {
        if (_wsTask) {
            [_wsTask cancelWithCloseCode:NSURLSessionWebSocketCloseCodeNormalClosure reason:nil];
            _wsTask = nil;
        }
        if (_session) {
            [_session finishTasksAndInvalidate];
            _session = nil;
        }
    }

    [self stopAudioCaptureInternal];
}

- (BOOL)setupTTSEngineWithConfig:(NSDictionary *)config error:(NSError **)error {
    _ttsConfig = [config copy];
    _ttsUID = [[[UIDevice currentDevice] identifierForVendor] UUIDString] ?: @"mobileclaw-ios";
    _ttsDebugPath = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject ?: NSTemporaryDirectory();

    [self destroyTTSEngine];

    _ttsEngine = [[SpeechEngine alloc] init];
    if (![_ttsEngine createEngineWithDelegate:self]) {
        if (error) {
            *error = [NSError errorWithDomain:@"HeaderWebSocket.TTS"
                                         code:-1
                                     userInfo:@{NSLocalizedDescriptionKey: @"Failed to create SpeechEngine instance"}];
        }
        return NO;
    }

    NSString *accessToken = [config[@"accessToken"] isKindOfClass:[NSString class]] ? config[@"accessToken"] : @"";
    NSString *address = [config[@"address"] isKindOfClass:[NSString class]] ? config[@"address"] : @"wss://openspeech.bytedance.com";
    NSString *uri = [config[@"uri"] isKindOfClass:[NSString class]] ? config[@"uri"] : @"/api/v3/tts/bidirection";
    NSString *resourceId = [config[@"resourceId"] isKindOfClass:[NSString class]] ? config[@"resourceId"] :
        ([config[@"cluster"] isKindOfClass:[NSString class]] ? config[@"cluster"] : @"seed-tts-2.0");
    NSString *instanceName = [config[@"voiceId"] isKindOfClass:[NSString class]] ? config[@"voiceId"] : @"";
    NSDictionary *options = [config[@"options"] isKindOfClass:[NSDictionary class]] ? config[@"options"] : nil;
    id requestHeadersValue = options[@"requestHeaders"];
    NSString *requestHeaders = @"{}";
    if ([requestHeadersValue isKindOfClass:[NSString class]] && [((NSString *)requestHeadersValue) length] > 0) {
        requestHeaders = requestHeadersValue;
    } else if ([requestHeadersValue isKindOfClass:[NSDictionary class]]) {
        NSData *headersData = [NSJSONSerialization dataWithJSONObject:requestHeadersValue options:0 error:nil];
        if (headersData != nil) {
            requestHeaders = [[NSString alloc] initWithData:headersData encoding:NSUTF8StringEncoding] ?: @"{}";
        }
    }

    NSString *customStartPayload = [options[@"startEnginePayload"] isKindOfClass:[NSString class]] ? options[@"startEnginePayload"] : nil;
    _ttsStartPayload = customStartPayload.length > 0 ? customStartPayload : [self buildBiTTSStartPayloadWithConfig:config];

    [_ttsEngine setStringParam:SE_BITTS_ENGINE forKey:SE_PARAMS_KEY_ENGINE_NAME_STRING];
    [_ttsEngine setStringParam:SE_LOG_LEVEL_WARN forKey:SE_PARAMS_KEY_LOG_LEVEL_STRING];
    [_ttsEngine setStringParam:_ttsDebugPath forKey:SE_PARAMS_KEY_DEBUG_PATH_STRING];
    [_ttsEngine setStringParam:_ttsUID forKey:SE_PARAMS_KEY_UID_STRING];
    [_ttsEngine setStringParam:_ttsUID forKey:SE_PARAMS_KEY_DEVICE_ID_STRING];
    [_ttsEngine setStringParam:config[@"appId"] forKey:SE_PARAMS_KEY_APP_ID_STRING];
    [_ttsEngine setStringParam:accessToken forKey:SE_PARAMS_KEY_APP_TOKEN_STRING];
    [_ttsEngine setIntParam:SEProtocolTypeSeed forKey:SE_PARAMS_KEY_PROTOCOL_TYPE_INT];
    [_ttsEngine setStringParam:address forKey:SE_PARAMS_KEY_TTS_ADDRESS_STRING];
    [_ttsEngine setStringParam:uri forKey:SE_PARAMS_KEY_TTS_URI_STRING];
    [_ttsEngine setStringParam:resourceId forKey:SE_PARAMS_KEY_RESOURCE_ID_STRING];
    [_ttsEngine setStringParam:requestHeaders forKey:SE_PARAMS_KEY_REQUEST_HEADERS_STRING];
    [_ttsEngine setStringParam:_ttsStartPayload forKey:SE_PARAMS_KEY_START_ENGINE_PAYLOAD_STRING];
    [_ttsEngine setBoolParam:YES forKey:SE_PARAMS_KEY_TTS_ENABLE_PLAYER_BOOL];
    [_ttsEngine setBoolParam:NO forKey:SE_PARAMS_KEY_ENABLE_PLAYER_AUDIO_CALLBACK_BOOL];
    [_ttsEngine setIntParam:SETtsDataCallbackModeNone forKey:SE_PARAMS_KEY_TTS_DATA_CALLBACK_MODE_INT];
    [_ttsEngine setIntParam:10000 forKey:SE_PARAMS_KEY_TTS_CONN_TIMEOUT_INT];

    SEEngineErrorCode ret = [_ttsEngine initEngine];
    if (ret != SENoError) {
        if (error) {
            *error = [NSError errorWithDomain:@"HeaderWebSocket.TTS"
                                         code:ret
                                     userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"Init TTS engine failed: %d", ret]}];
        }
        [self destroyTTSEngine];
        return NO;
    }

    _ttsReady = YES;
    [self resetTTSPlaybackState];
    [self emitTTSStatus:@"initialized"
                  extra:@{
                      @"resourceId": resourceId,
                      @"instanceName": instanceName,
                      @"speaker": [self currentBiTTSSpeaker],
                      @"address": address,
                      @"uri": uri
                  }];

    return YES;
}

- (void)destroyTTSEngine {
    _ttsReady = NO;
    _ttsStartPayload = nil;
    _ttsPendingText = nil;
    [self resetTTSPlaybackState];

    if (_ttsEngine != nil) {
        [_ttsEngine sendDirective:SEDirectiveSyncStopEngine];
        [_ttsEngine destroyEngine];
        _ttsEngine = nil;
    }
}

- (void)emitClose:(NSInteger)code reason:(NSString *)reason {
    if (_hasListeners) {
        [self sendEventWithName:@"onClose" body:@{@"code": @(code), @"reason": reason ?: @""}];
    }
}

- (void)stopAudioCaptureInternal {
    _isAudioCapturing = NO;

    if (_audioEngine) {
        AVAudioInputNode *inputNode = _audioEngine.inputNode;
        [inputNode removeTapOnBus:0];
        [_audioEngine stop];
        _audioEngine = nil;
    }

    _audioConverter = nil;

    NSError *sessionError = nil;
    [[AVAudioSession sharedInstance] setActive:NO
                                   withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                         error:&sessionError];
}

- (void)emitAudioError:(NSString *)message {
    if (_hasListeners) {
        [self sendEventWithName:@"onAudioCaptureError"
                           body:@{@"message": message ?: @"Unknown audio capture error"}];
    }
}

- (void)emitAudioStatus:(NSString *)status extra:(NSDictionary *)extra {
    if (_hasListeners) {
        NSMutableDictionary *body = [NSMutableDictionary dictionaryWithObject:(status ?: @"unknown")
                                                                       forKey:@"status"];
        if (extra) {
            [body addEntriesFromDictionary:extra];
        }
        [self sendEventWithName:@"onAudioCaptureStatus" body:body];
    }
}

- (void)emitTTSStatus:(NSString *)status extra:(NSDictionary *)extra {
    if (_hasListeners) {
        NSMutableDictionary *body = [NSMutableDictionary dictionaryWithObject:(status ?: @"unknown")
                                                                       forKey:@"status"];
        if (extra != nil) {
            [body addEntriesFromDictionary:extra];
        }
        [self sendEventWithName:@"onTTSStatus" body:body];
    }
}

- (void)emitTTSError:(NSString *)message code:(NSNumber *)code {
    if (_hasListeners) {
        NSMutableDictionary *body = [NSMutableDictionary dictionaryWithObject:(message ?: @"Unknown TTS error")
                                                                       forKey:@"message"];
        if (code != nil) {
            body[@"code"] = code;
        }
        [self sendEventWithName:@"onTTSError" body:body];
    }
}

- (void)emitPCMBuffer:(AVAudioPCMBuffer *)buffer
          inputFormat:(AVAudioFormat *)inputFormat
         targetFormat:(AVAudioFormat *)targetFormat
{
    if (!_audioConverter || !_isAudioCapturing || buffer.frameLength == 0) {
        return;
    }

    AVAudioFrameCount outputCapacity =
      (AVAudioFrameCount)ceil(((double)buffer.frameLength * targetFormat.sampleRate) / inputFormat.sampleRate);
    if (outputCapacity == 0) {
        return;
    }

    AVAudioPCMBuffer *converted =
      [[AVAudioPCMBuffer alloc] initWithPCMFormat:targetFormat frameCapacity:outputCapacity];
    if (!converted) {
        [self emitAudioError:@"Failed to allocate converted audio buffer"];
        return;
    }

    __block BOOL didProvideInput = NO;
    NSError *error = nil;
    AVAudioConverterOutputStatus status =
      [_audioConverter convertToBuffer:converted
                                 error:&error
                    withInputFromBlock:^AVAudioBuffer * _Nullable(AVAudioPacketCount inNumberOfPackets,
                                                                  AVAudioConverterInputStatus *outStatus) {
        if (didProvideInput) {
            *outStatus = AVAudioConverterInputStatus_NoDataNow;
            return nil;
        }
        didProvideInput = YES;
        *outStatus = AVAudioConverterInputStatus_HaveData;
        return buffer;
    }];

    if (error || status == AVAudioConverterOutputStatus_Error) {
        [self emitAudioError:error.localizedDescription ?: @"Audio conversion failed"];
        return;
    }

    AudioBuffer audioBuffer = converted.audioBufferList->mBuffers[0];
    if (audioBuffer.mData == NULL || audioBuffer.mDataByteSize == 0) {
        return;
    }

    const uint8_t *bytes = (const uint8_t *)audioBuffer.mData;
    NSUInteger length = audioBuffer.mDataByteSize;
    NSMutableArray<NSNumber *> *payload = [NSMutableArray arrayWithCapacity:length];
    for (NSUInteger i = 0; i < length; i++) {
        [payload addObject:@(bytes[i])];
    }

    if (_hasListeners) {
        [self sendEventWithName:@"onAudioData" body:@{@"data": payload}];
    }
}

- (void)onMessageWithType:(SEMessageType)type andData:(NSData *)data {
    NSString *message = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";

    switch (type) {
        case SEEngineStart:
            [self emitTTSStatus:@"engine-start" extra:nil];
            [self beginBiTTSSessionIfNeeded];
            break;
        case SEEngineStop:
            if (_ttsSpeaking || _ttsPlaybackStarted) {
                [self emitTTSStatus:@"stopped" extra:nil];
            }
            [self resetTTSPlaybackState];
            _ttsPendingText = nil;
            break;
        case SEEngineError:
            [self failBiTTSWithMessage:(message.length > 0 ? message : @"SpeechEngine reported an error")
                                  code:nil];
            break;
        case SEEventConnectionStarted:
            [self emitTTSStatus:@"connection-started" extra:nil];
            break;
        case SEEventConnectionFailed:
            [self failBiTTSWithMessage:(message.length > 0 ? message : @"BiTTS connection failed")
                                  code:nil];
            break;
        case SEEventConnectionFinished:
            [self emitTTSStatus:@"connection-finished" extra:nil];
            break;
        case SEEventSessionStarted:
            [self emitTTSStatus:@"session-started" extra:nil];
            break;
        case SEEventSessionCanceled:
            [self emitTTSStatus:@"session-canceled" extra:nil];
            [self resetTTSPlaybackState];
            break;
        case SEEventSessionFinished:
            _ttsSessionFinished = YES;
            [self emitTTSStatus:@"session-finished" extra:nil];
            [self completeBiTTSIfReady];
            break;
        case SEEventSessionFailed:
            [self failBiTTSWithMessage:(message.length > 0 ? message : @"BiTTS session failed")
                                  code:nil];
            break;
        case SEEventTTSSentenceStart:
            [self emitTTSStatus:@"sentence-started" extra:nil];
            break;
        case SEEventTTSSentenceEnd:
            [self emitTTSStatus:@"sentence-finished" extra:nil];
            break;
        case SEEventTTSEnded:
            _ttsStreamFinished = YES;
            [self emitTTSStatus:@"synthesis-ended" extra:nil];
            [self completeBiTTSIfReady];
            break;
        case SEPlayerStartPlayAudio:
            _ttsPlaybackStarted = YES;
            [self emitTTSStatus:@"playing" extra:[self currentAudioRouteInfo]];
            break;
        case SEPlayerFinishPlayAudio:
            _ttsPlaybackStarted = NO;
            [self emitTTSStatus:@"playback-finished" extra:[self currentAudioRouteInfo]];
            [self completeBiTTSIfReady];
            break;
        default:
            break;
    }
}

- (void)resetTTSPlaybackState {
    _ttsSpeaking = NO;
    _ttsPlaybackStarted = NO;
    _ttsSessionFinished = NO;
    _ttsStreamFinished = NO;
}

- (NSString *)currentBiTTSSpeaker {
    NSString *speaker = [_ttsConfig[@"voiceType"] isKindOfClass:[NSString class]] ? _ttsConfig[@"voiceType"] : @"";
    if (speaker.length == 0) {
        speaker = @"zh_female_vv_uranus_bigtts";
    }
    return speaker;
}

- (NSString *)buildBiTTSStartPayloadWithConfig:(NSDictionary *)config {
    NSDictionary *options = [config[@"options"] isKindOfClass:[NSDictionary class]] ? config[@"options"] : nil;
    NSString *uid = [options[@"uid"] isKindOfClass:[NSString class]] && [options[@"uid"] length] > 0
        ? options[@"uid"]
        : (_ttsUID ?: @"mobileclaw-ios");
    NSMutableDictionary *reqParams = [NSMutableDictionary dictionaryWithObject:[self currentBiTTSSpeaker]
                                                                        forKey:@"speaker"];
    if ([options[@"audioParams"] isKindOfClass:[NSDictionary class]]) {
        reqParams[@"audio_params"] = options[@"audioParams"];
    }

    NSDictionary *payload = @{
        @"user": @{@"uid": uid},
        @"req_params": reqParams
    };
    return [self jsonStringFromObject:payload fallback:@"{}"];
}

- (NSString *)jsonStringFromObject:(id)object fallback:(NSString *)fallback {
    if (object == nil || ![NSJSONSerialization isValidJSONObject:object]) {
        return fallback;
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
    if (data == nil) {
        return fallback;
    }
    NSString *string = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return string.length > 0 ? string : fallback;
}

- (void)beginBiTTSSessionIfNeeded {
    if (!_ttsSpeaking || _ttsPendingText.length == 0 || _ttsEngine == nil) {
        return;
    }

    NSString *text = [_ttsPendingText copy];
    _ttsPendingText = nil;

    dispatch_async(dispatch_get_main_queue(), ^{
        SEEngineErrorCode startRet = [self->_ttsEngine sendDirective:SEDirectiveEventStartSession data:@""];
        if (startRet != SENoError) {
            [self failBiTTSWithMessage:[NSString stringWithFormat:@"Start BiTTS session failed: %d", startRet]
                                  code:@(startRet)];
            return;
        }

        NSString *taskPayload = [self jsonStringFromObject:@{
            @"req_params": @{@"text": text}
        } fallback:nil];
        if (taskPayload.length == 0) {
            [self failBiTTSWithMessage:@"Failed to encode BiTTS task payload" code:nil];
            return;
        }

        SEEngineErrorCode taskRet = [self->_ttsEngine sendDirective:SEDirectiveEventTaskRequest data:taskPayload];
        if (taskRet != SENoError) {
            [self failBiTTSWithMessage:[NSString stringWithFormat:@"BiTTS task request failed: %d", taskRet]
                                  code:@(taskRet)];
            return;
        }

        SEEngineErrorCode finishRet = [self->_ttsEngine sendDirective:SEDirectiveEventFinishSession data:@""];
        if (finishRet != SENoError) {
            [self failBiTTSWithMessage:[NSString stringWithFormat:@"Finish BiTTS session failed: %d", finishRet]
                                  code:@(finishRet)];
        }
    });
}

- (void)completeBiTTSIfReady {
    if (!_ttsSpeaking || _ttsPlaybackStarted) {
        return;
    }
    if (!_ttsSessionFinished && !_ttsStreamFinished) {
        return;
    }

    [self resetTTSPlaybackState];
    [self emitTTSStatus:@"finished" extra:nil];
}

- (void)failBiTTSWithMessage:(NSString *)message code:(NSNumber *)code {
    _ttsPendingText = nil;
    [self resetTTSPlaybackState];
    [self emitTTSError:(message.length > 0 ? message : @"Unknown BiTTS error") code:code];
}

- (void)dealloc {
    [self cleanup];
    [self destroyTTSEngine];
}

@end
