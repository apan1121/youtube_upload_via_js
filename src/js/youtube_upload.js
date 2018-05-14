var YoutTubeUplaod = function(inputOptions) {

    var defaultOption = {
        client_id: '737474123816-92hslaf1o63li3esqvvkoqsra2ciedq1.apps.googleusercontent.com',
        auth_login_button_id: 'authLogin',
        default_tags: [],
        signin_callback: null,
        youtube_ready: null,
        youtube_progress: null,
        youtube_complete: null,
        youtube_poll_video_status: null,
    };

    var options = Object.assign({}, defaultOption, inputOptions);

    var STATUS_POLLING_INTERVAL_MILLIS = 10 * 1000;

    var UploadVideo = null;

    var inputVideoFile = null;

    var canUpload = true;
    if (1) {
        UploadVideo = function() {
            /* 預設影片標籤 */
            this.tags = [].concat(options.default_tags);
            /* 預設影片分類 */
            this.categoryId = 15;
            this.videoId = '';
            this.uploadStartTime = 0;
        };

        UploadVideo.prototype.ready = function(accessToken) {
            this.accessToken = accessToken;
            this.gapi = gapi;
            this.authenticated = true;
            this.gapi.client.request({
                path: '/youtube/v3/channels',
                params: {
                    part: 'snippet',
                    mine: true
                },
                callback: function(response) {
                    if (response.error) {
                        console.log(response.error.message);
                    } else {
                        if (typeof(options.youtube_ready) == 'function') {
                            var snippet = response.items[0].snippet;
                            options.youtube_ready(snippet);
                        }
                    }
                }.bind(this)
            });
        };

        UploadVideo.prototype.canUpload = function() {
            return canUpload;
        };

        UploadVideo.prototype.setVideoFile = function(file, callback) {
            var patt = new RegExp("video/*");

            if (patt.test(file.type)) {
                inputVideoFile = file;
                var fileReader = new FileReader();
                callback('wait', '10');
                console.log("here 1");
                fileReader.onload = function() {
                    callback('wait', '30');
                    var blob = new Blob([fileReader.result], { type: file.type });
                    var url = URL.createObjectURL(blob);
                    console.log("here 2", url);
                    var video = document.createElement('video');
                    var timeupdate = function() {
                        console.log("here 5");
                        if (snapImage()) {
                            video.removeEventListener('timeupdate', timeupdate);
                            video.pause();
                        } else {
                            callback(false);
                        }
                    };
                    console.log("here 3");
                    callback('wait', '40');
                    video.addEventListener('loadeddata', function() {
                        console.log("here 6");
                        if (snapImage()) {
                            video.removeEventListener('timeupdate', timeupdate);
                        } else {
                            callback(false);
                        }
                    });
                    var snapImage = function() {
                        callback('wait', '60');
                        var canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        callback('wait', '70');
                        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                        var image = canvas.toDataURL();
                        callback('wait', '80');
                        console.log("here 7" , image);
                        var success = image.length > 100000;
                        if (success) {
                            if (typeof(callback) == "function") {
                                callback('processed', image);
                            }
                            URL.revokeObjectURL(url);
                        }
                        console.log("here 8");
                        return success;
                    };
                    console.log("here 4");
                    video.addEventListener('timeupdate', timeupdate);
                    video.preload = 'metadata';
                    video.src = url;
                    // Load video in Safari / IE11
                    video.muted = true;
                    video.playsInline = true;
                    video.play();
                    callback('wait', '50');
                };
                callback('wait', '20');
                fileReader.readAsArrayBuffer(file);

                return true;
            } else {
                return false;
            }
        };

        UploadVideo.prototype.upload = function(params) {
            if (inputVideoFile == null) {
                return false;
            }

            canUpload = false;

            var file = inputVideoFile;
            var metadata = {
                snippet: {
                    title: params.title,
                    description: params.description,
                    tags: this.tags.concat(params.tags),
                    categoryId: this.categoryId
                },
                status: {
                    privacyStatus: params.privacy,
                }
            };

            var uploader = new MediaUploader({
                baseUrl: 'https://www.googleapis.com/upload/youtube/v3/videos',
                file: file,
                token: this.accessToken,
                metadata: metadata,
                params: {
                    part: Object.keys(metadata).join(',')
                },
                onError: function(data) {
                    var message = data;
                    try {
                        var errorResponse = JSON.parse(data);
                        message = errorResponse.error.message;
                    } finally {
                        alert(message);
                    }
                }.bind(this),
                onProgress: function(data) {
                    var currentTime = Date.now();
                    var bytesUploaded = data.loaded;
                    var totalBytes = data.total;
                    // The times are in millis, so we need to divide by 1000 to get seconds.
                    var bytesPerSecond = bytesUploaded / ((currentTime - this.uploadStartTime) / 1000);
                    var estimatedSecondsRemaining = (totalBytes - bytesUploaded) / bytesPerSecond;
                    var percentageComplete = (bytesUploaded * 100) / totalBytes;

                    if (typeof(options.youtube_progress) == "function") {
                        options.youtube_progress(percentageComplete, bytesUploaded, totalBytes);
                    }

                }.bind(this),
                onComplete: function(data) {
                    var uploadResponse = JSON.parse(data);
                    this.videoId = uploadResponse.id;

                    if (typeof(options.youtube_complete) == "function") {
                        options.youtube_complete(uploadResponse);
                    }
                    this.pollForVideoStatus(uploadResponse);
                }.bind(this)
            });
            // This won't correspond to the *exact* start of the upload, but it should be close enough.
            this.uploadStartTime = Date.now();
            uploader.upload();
            return true;
        };

        UploadVideo.prototype.detectVideoStatus = function(videoId){
            this.videoId = videoId;
            canUpload = false;
            this.pollForVideoStatus();
        };


        UploadVideo.prototype.pollForVideoStatus = function() {
            this.gapi.client.request({
                path: '/youtube/v3/videos',
                params: {
                    part: 'status,player',
                    id: this.videoId
                },
                callback: function(response) {
                    if (response.error) {
                        options.youtube_poll_video_status(false, response.error.message);
                        setTimeout(this.pollForVideoStatus.bind(this), STATUS_POLLING_INTERVAL_MILLIS);
                    } else {
                        if (response.items[0]) {
                            var uploadStatus = response.items[0].status.uploadStatus;
                            switch (uploadStatus) {
                                case 'uploaded':
                                    options.youtube_poll_video_status(true, {uploadStatus: uploadStatus});
                                    setTimeout(this.pollForVideoStatus.bind(this), STATUS_POLLING_INTERVAL_MILLIS);
                                    break;
                                case 'processed':
                                    options.youtube_poll_video_status(true, {uploadStatus: uploadStatus, data: response.items[0]});
                                    break;
                                default:
                                    options.youtube_poll_video_status(false, "Transcoding failed.");
                                    break;
                            }
                        } else {
                            options.youtube_poll_video_status(false, "Upload failed.");
                        }
                    }
                }.bind(this)
            });
        };
    }
    var uploadVideo = new UploadVideo();


    var target = document.getElementById(options.auth_login_button_id);
    var clientid = target.dataset.clientid;
    target.innerHTML = "" +
        "<span " +
        "class='g-signin' " +
        "data-callback='signinCallback' " +
        "data-clientid='" + options.client_id + "' " +
        "data-cookiepolicy='single_host_origin' " +
        "data-scope='https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube' " +
        "></span>";


    var po = document.createElement('script');
    po.type = 'text/javascript';
    po.async = true;
    po.src = 'https://apis.google.com/js/client:plusone.js';
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(po, s);

    window["signinCallback"] = function(result) { // this is not fired
        if (typeof(options.signin_callback) == "function") {
            options.signin_callback(result);
        }
        if (result.access_token) {
            uploadVideo.ready(result.access_token);
        }
    }



    var DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v2/files/';
    var RetryHandler = function() {
        this.interval = 1000; // Start at one second
        this.maxInterval = 60 * 1000; // Don't wait longer than a minute
    };
    RetryHandler.prototype.retry = function(fn) {
        setTimeout(fn, this.interval);
        this.interval = this.nextInterval_();
    };
    RetryHandler.prototype.reset = function() {
        this.interval = 1000;
    };
    RetryHandler.prototype.nextInterval_ = function() {
        var interval = this.interval * 2 + this.getRandomInt_(0, 1000);
        return Math.min(interval, this.maxInterval);
    };
    RetryHandler.prototype.getRandomInt_ = function(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    };

    var MediaUploader = function(options) {
        var noop = function() {};
        this.file = options.file;
        this.contentType = options.contentType || this.file.type || 'application/octet-stream';
        this.metadata = options.metadata || {
            'title': this.file.name,
            'mimeType': this.contentType
        };
        this.token = options.token;
        this.onComplete = options.onComplete || noop;
        this.onProgress = options.onProgress || noop;
        this.onError = options.onError || noop;
        this.offset = options.offset || 0;
        this.chunkSize = options.chunkSize || 0;
        this.retryHandler = new RetryHandler();

        this.url = options.url;
        if (!this.url) {
            var params = options.params || {};
            params.uploadType = 'resumable';
            this.url = this.buildUrl_(options.fileId, params, options.baseUrl);
        }
        this.httpMethod = options.fileId ? 'PUT' : 'POST';
    };
    MediaUploader.prototype.upload = function() {
        var self = this;
        var xhr = new XMLHttpRequest();

        xhr.open(this.httpMethod, this.url, true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Upload-Content-Length', this.file.size);
        xhr.setRequestHeader('X-Upload-Content-Type', this.contentType);

        xhr.onload = function(e) {
            if (e.target.status < 400) {
                var location = e.target.getResponseHeader('Location');
                this.url = location;
                this.sendFile_();
            } else {
                this.onUploadError_(e);
            }
        }.bind(this);
        xhr.onerror = this.onUploadError_.bind(this);
        xhr.send(JSON.stringify(this.metadata));
    };

    MediaUploader.prototype.sendFile_ = function() {
        var content = this.file;
        var end = this.file.size;

        if (this.offset || this.chunkSize) {
            // Only bother to slice the file if we're either resuming or uploading in chunks
            if (this.chunkSize) {
                end = Math.min(this.offset + this.chunkSize, this.file.size);
            }
            content = content.slice(this.offset, end);
        }

        var xhr = new XMLHttpRequest();
        xhr.open('PUT', this.url, true);
        xhr.setRequestHeader('Content-Type', this.contentType);
        xhr.setRequestHeader('Content-Range', 'bytes ' + this.offset + '-' + (end - 1) + '/' + this.file.size);
        xhr.setRequestHeader('X-Upload-Content-Type', this.file.type);
        if (xhr.upload) {
            xhr.upload.addEventListener('progress', this.onProgress);
        }
        xhr.onload = this.onContentUploadSuccess_.bind(this);
        xhr.onerror = this.onContentUploadError_.bind(this);
        xhr.send(content);
    };

    MediaUploader.prototype.resume_ = function() {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', this.url, true);
        xhr.setRequestHeader('Content-Range', 'bytes */' + this.file.size);
        xhr.setRequestHeader('X-Upload-Content-Type', this.file.type);
        if (xhr.upload) {
            xhr.upload.addEventListener('progress', this.onProgress);
        }
        xhr.onload = this.onContentUploadSuccess_.bind(this);
        xhr.onerror = this.onContentUploadError_.bind(this);
        xhr.send();
    };

    MediaUploader.prototype.extractRange_ = function(xhr) {
        var range = xhr.getResponseHeader('Range');
        if (range) {
            this.offset = parseInt(range.match(/\d+/g).pop(), 10) + 1;
        }
    };

    MediaUploader.prototype.onContentUploadSuccess_ = function(e) {
        if (e.target.status == 200 || e.target.status == 201) {
            this.onComplete(e.target.response);
        } else if (e.target.status == 308) {
            this.extractRange_(e.target);
            this.retryHandler.reset();
            this.sendFile_();
        }
    };


    MediaUploader.prototype.onContentUploadError_ = function(e) {
        if (e.target.status && e.target.status < 500) {
            this.onError(e.target.response);
        } else {
            this.retryHandler.retry(this.resume_.bind(this));
        }
    };

    MediaUploader.prototype.onUploadError_ = function(e) {
        this.onError(e.target.response); // TODO - Retries for initial upload
    };

    MediaUploader.prototype.buildQuery_ = function(params) {
        params = params || {};
        return Object.keys(params).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');
    };


    MediaUploader.prototype.buildUrl_ = function(id, params, baseUrl) {
        var url = baseUrl || DRIVE_UPLOAD_URL;
        if (id) {
            url += id;
        }
        var query = this.buildQuery_(params);
        if (query) {
            url += '?' + query;
        }
        return url;
    };

    return uploadVideo;
};