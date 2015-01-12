var fs = require("fs");
var ytdl = require("ytdl-core");
var ffmpeg = require('fluent-ffmpeg');
var path = require('path');
var http = require("http");
var url = require("url");
var req = require('request');
var ffmetadata = require('./metadata');



var DEBUG = false;

var filesArray = [];

fs.exists('/audioFiles', function(exists) {
    if (exists) {
        console.log("exists");
        populateFileArray();
    } else {
        fs.mkdir('audioFiles', populateFileArray);
        fs.mkdir('imageFiles', function() {});
    }
});

function populateFileArray() {
    //we need to populate the files array with all existing files, we'll do this asynchonously
    fs.readdir("audioFiles/", function(err, files) {
        filesArray = filesArray.concat(files);
        console.log(filesArray);
    });
}

function sendAudioFile(videoId, response) {

    var filePath = path.join(__dirname, "audioFiles/" + videoId + ".mp3");

    var stat = fs.statSync(filePath);

    response.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size
    });

    var readStream = fs.createReadStream(filePath);

    readStream.pipe(response);
    console.log("response sent");

}

function addMetaData(videoId, metadata, callback) {
    console.log("adding meta data");
    console.log(metadata);

    var options = {
            attachments: [metadata.artwork]
        };

        



    if (metadata.artwork) {

        delete metadata.artwork;

    ffmetadata.write('audioFiles/' + videoId + '.mp3', metadata, options, function(err) {
        if (err) {
            console.error("Error writing cover art");
        } else {
            console.log('artwork added');
            callback();

        }
    });

    }else{

        ffmetadata.write('audioFiles/' + videoId + '.mp3', metadata, function(err) {
        if (err) {
            console.error("Error writing cover art");
        } else {
            console.log('artwork added');
            callback();

        }
    });

    }

}


http.createServer(function(request, response) {

    var videoId = url.parse(request.url).query;

    if (videoId == null) {
        response.end();
        return;
    }

    if (DEBUG) {
        videoId = "debug";
    }

    //ok let's check if we have the file
    var fileExists = false;
    for (var i = 0; i < filesArray.length; i++) {

        if (filesArray[i] == videoId + ".mp3") {
            fileExists = true;
            break;
        }

    }

    var filePath = path.join(__dirname, "audioFiles/" + videoId + ".mp3");

    // if (DEBUG) fileExists = false; //for debugging

    //if we already have the file we'll just send it
    if (fileExists) {
        console.log("file " + videoId + ".mp3 already converted");

        sendAudioFile(videoId, response);

    } else {
        console.log("preparing to download " + videoId + ".mp3");
        //in this case we need to download/convert it first

        var metadata = {
            videoId: videoId,
            title: null,
            artist: null
        };
        var trackDataRetrieved = false;
        var fileConverted = false;

        if (!DEBUG) {
            //we need to get the related data first
            var inputStream = ytdl('http://www.youtube.com/watch?v=' + videoId, {
                quality: 'lowest',
                filter: function(format) {
                    return format.container === 'mp4';
                }
            });
        }


        var youtubeInfo = function onInfo(info, format) {

            console.log("searching echonest for: " + info.title);

            var artistQuery = '';

            if(info.author.toLowerCase().indexOf("vevo") != -1){
                info.author = info.author.toLowerCase().replace("vevo","");
            }

            var titleCondensed = info.title.toLowerCase().replace(' ','');
            var artistCondensed = info.author.toLowerCase().replace(' ','');

            if(titleCondensed.indexOf(artistCondensed) != -1){

                var titleStartIndex = 0;
                var titleEndIndex = 0;
                var artistIndex = 0;

                //this looks for the artist inside the title. It doesn't care about spaces but does return
                //the string with spaces if there were any.
                for(i=0; i<info.title.length; i++){

                    if(info.title.toLowerCase().charAt(i) == artistCondensed.charAt(artistIndex)){
                        if(artistIndex == 0){
                            titleStartIndex = i;
                        }
                        artistIndex ++;

                        if(artistIndex == artistCondensed.length){
                            titleEndIndex = i+1;

                            break;
                        }
                    }else if(info.title.charAt(i) != ' '){

                        artistIndex = titleStartIndex = 0;
                    }
                }

                var artist = info.title.substring(titleStartIndex, titleEndIndex);

                console.log("artist: "+artist);

                artistQuery = '&artist=' + encodeURIComponent(artist);
                info.title = info.title.toLowerCase().replace(artist.toLowerCase(),'');
            }
            var echoNestUrl = 'http://developer.echonest.com/api/v4/song/search?api_key=7WFN0LV9VZMGAFZFQ&results=1&max_duration=' + info.length_seconds + '&combined=' + encodeURIComponent(info.title) + artistQuery;
            console.log("searching echonest: "+echoNestUrl);
            req(echoNestUrl, function(error, response, body) {
                if (!error && response.statusCode == 200) {

                    var songs = JSON.parse(body).response.songs;

                    if (!songs) {
                        console.log("Couldn't get any tracks from Echo Nest!");
                        return;
                    }
                    console.log('https://api.spotify.com/v1/search?type=track&limit=1&q=' + encodeURIComponent(songs[0].title));
                    req('https://api.spotify.com/v1/search?type=track&limit=1&q=' + encodeURIComponent(songs[0].title), function(error, response, body) {
                        if (!error && response.statusCode == 200) {
                            console.log("received spotify data");
                            var info = JSON.parse(body);
                            trackDataRetrieved = true;
                            if (info.tracks.items.length > 0) {
                                console.log("Found tracks from spotify!");
                                console.log(info.tracks.items[0].album.images[0].url);
                                req(info.tracks.items[0].album.images[0].url).pipe(fs.createWriteStream('imageFiles/' + videoId + '.jpg'));
                                metadata = {
                                    title: info.tracks.items[0].name,
                                    artist: info.tracks.items[0].artists[0].name,
                                    album: info.tracks.items[0].album.name,
                                    artwork: 'imageFiles/' + videoId + '.jpg'
                                };

                                console.log(metadata);


                                if (fileConverted) {
                                    addMetaData(videoId, metadata, function() {
                                        sendAudioFile(videoId, response);
                                    });
                                }
                                //we're now good to begin converting
                            } else {
                                //we couldn't find metadata for the track :'( 
                                console.log("Couldn't get any tracks from spotify!");
                                metadata = {
                                    title: songs[0].title
                                };

                                if (fileConverted) {
                                    addMetaData(videoId, metadata, function() {
                                        sendAudioFile(videoId, response);
                                    });
                                }
                            }

                        } else {
                            trackDataRetrieved = true;
                            metadata = {
                                title: songs[0].title
                            };

                            if (fileConverted) {
                                addMetaData(videoId, metadata, function() {
                                    sendAudioFile(videoId, response);
                                });
                            }
                            console.log("Spotify Error");
                        }
                    });
                } else {

                    trackDataRetrieved = true;
                    metadata = {
                        title: info.title
                    };

                    if (fileConverted) {
                        addMetaData(videoId, metadata, function() {
                            sendAudioFile(videoId, response);
                        });
                    }

                    console.log("Echo nest Error");
                }
            });

        };

        if (DEBUG) {
            youtubeInfo({
                title: "Land of Confusion - Genesis"
            });
        } else {
            inputStream.on('info', youtubeInfo);
        }


        var transcoder;

        if (DEBUG) {
            transcoder = ffmpeg('debug/genesis.mp4');
        } else {
            transcoder = ffmpeg(inputStream);
        }
        transcoder
            .noVideo()
            .save('audioFiles/' + videoId + '.mp3');

        transcoder.on('start', function(commandLine) {
            console.log('Spawned Ffmpeg with command: ' + commandLine);
        });

        // transcoder.on('progress', function(progress) {});

        transcoder.on('codecData', function(data) {
            console.log('Input is ' + data.audio + ' audio ' +
                'with ' + data.video + ' video');
        });

        transcoder.on('end', function() {
            console.log('file converted');
            fileConverted = true;

            filesArray.push(videoId + ".mp3");

            if (trackDataRetrieved)
                addMetaData(videoId, metadata, function() {
                    sendAudioFile(videoId, response);
                });

        });


    }



}).listen(8050);