var fs = require("fs");
var ytdl = require("ytdl-core");
var ffmpeg = require('fluent-ffmpeg');
var path = require('path');
var http = require("http");
var url = require("url");
var req = require('request');
var ffmetadata = require('./metadata');



var DEBUG = true;

var filesArray = [];

//we need to populate the files array with all existing files, we'll do this asynchonously
fs.readdir("audioFiles/", function(err, files) {
    filesArray = filesArray.concat(files);
    console.log(filesArray);
});

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

function addMetaData(metadata, callback) {
    console.log("adding meta data");
    console.log(metadata);

    var options = {
        attachments: [metadata.artwork]
    };

    var data = {
        title: metadata.title,
        artist: metadata.artist
    };

    ffmetadata.write('audioFiles/' + metadata.videoId + '.mp3', data, options, function(err) {
        if (err) {
            console.error("Error writing cover art");
        } else {
            console.log('artwork added');
            callback();

        }
    });

    /*
        var mParams = [
            '-i', 'audioFiles/' + metadata.videoId + '.mp3',
            '-loglevel', 'info',
            //'-acodec', 'copy',
            //'-vn',
            //'-y',
            '-y',
            '-id3v2_version', '3',
            '-t', '2',
            '-metadata:s:v', 'title="Album cover"',
            '-metadata:s:v', 'comment="Cover (Front)"',
            'audioFiles/' + metadata.videoId + '_out.mp3'
        ];

        if (metadata.artwork != undefined) {
            console.log('writing artwork data');


            mParams.splice(2, 0, '1');
            mParams.splice(2, 0, '-map');

            mParams.splice(2, 0, '0');
            mParams.splice(2, 0, '-map');

            mParams.splice(2, 0, 'copy');
            mParams.splice(2, 0, '-c');

            mParams.splice(2, 0, metadata.artwork);
            mParams.splice(2, 0, '-i');
        }

        if (metadata.artist != undefined) {
            console.log('writing artist data');
            mParams.splice(mParams.length - 1, 0, '-metadata');
            mParams.splice(mParams.length - 1, 0, 'artist=' + metadata.artist);
        }

        if (metadata.title != undefined) {
            console.log('writing title data');
            mParams.splice(mParams.length - 1, 0, '-metadata');
            mParams.splice(mParams.length - 1, 0, 'title=' + metadata.title);
        }
        console.log(mParams.join(' '));
        var stream = avconv(mParams);

        stream.on('message', function(data) {
            process.stdout.write(data);

        });


        stream.on('exit', function() {
            console.log('metadata added');



            var options = {
                attachments: [metadata.artwork],
            };
            ffmetadata.write('audioFiles/' + metadata.videoId + '_out.mp3', {}, options, function(err) {
                if (err) {
                    console.error("Error writing cover art");
                } else {
                    console.log('artwork added');
                    fs.unlink('audioFiles/' + metadata.videoId + '.mp3', function(err) {
                        if (err) throw err;
                        console.log('successfully deleted audioFiles/' + metadata.videoId + '.mp3');

                        fs.rename('audioFiles/' + metadata.videoId + '_out.mp3', 'audioFiles/' + metadata.videoId + '.mp3', function(err) {

                            callback();

                        });
                    });


                }
            });



        });
    */
}


http.createServer(function(request, response) {

    var videoId = url.parse(request.url).query;

    if (videoId == null) {
        response.end();
        return;
    }

    if(DEBUG){
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

            console.log("searching spotify for: " + info.title);

            req('https://api.spotify.com/v1/search?type=track&limit=1&q=' + encodeURIComponent(info.title), function(error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log("received spotify data");
                    var info = JSON.parse(body);
                    if (info.tracks.total > 0) {
                        console.log("Found tracks from spotify!");
                        console.log(info.tracks.items[0].album.images[0].url);
                        req(info.tracks.items[0].album.images[0].url).pipe(fs.createWriteStream('imageFiles/' + videoId + '.jpg'));
                        metadata = {
                            videoId: videoId,
                            title: info.tracks.items[0].name,
                            artist: info.tracks.items[0].artists[0].name,
                            artwork: 'imageFiles/' + videoId + '.jpg'
                        };
                        trackDataRetrieved = true;

                        if (fileConverted)
                            addMetaData(metadata, function() {
                                sendAudioFile(videoId, response);
                            });
                        //we're now good to begin converting
                    } else {
                        //we couldn't find metadata for the track :'( 
                        console.log("Couldn't get any tracks from spotify!");

                    }

                } else {
                    console.log("Spotify Error");
                }
            })

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
        // .inputOptions('-id3v2_version 3')
        // .inputOptions('-write_id3v1 1')
        // .inputOptions('-f mp3')
            .noVideo()
            // .audioBitrate(192)
            // .inputOptions('-c:a libmp3lame')
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

            filesArray.push(videoId+".mp3");

            if (trackDataRetrieved)
                addMetaData(metadata, function() {
                    sendAudioFile(videoId, response);
                });

        });


        /* 

var stream = avconv(params);

req("http://i2.ytimg.com/vi/"+videoId+"/hqdefault.jpg").pipe(fs.createWriteStream("imageFiles/"+videoId+".jpg"));

var data = {};

ytdl('http://www.youtube.com/watch?v='+videoId, { quality: 'lowest', filter: function(format) { return format.container === 'mp4'; } })
.on('info', function(Info, Format)
{
//console.log(Format.audioBitrate);

//var contentLength = Format.audioBitrate*1000*parseInt(Info.length_seconds);
//console.log(contentLength);

data = {
title: Info.title,
artist: Info.author
}


})
.pipe(stream);

stream.pipe(fs.createWriteStream('audioFiles/'+videoId+'.mp3'));

console.log("converting file");

stream.on('message', function(data) {
    process.stdout.write(data);

});


stream.on('exit', function() {
    console.log('file converted');

    //we need to add the file to the files array for the future
    filesArray.push(videoId+".mp3");
    console.log("adding "+videoId+".mp3 to files array");


var metadata = [
    '-i', 'audioFiles/'+videoId+'.mp3',
    '-loglevel', 'info',
    '-i', "imageFiles/"+videoId+".jpg",
    '-c', 'copy',
    '-y',
    '-metadata:s:v', 'title="tiiitle"',
    '-metadata:s:v', 'artist="aaartist"',
    'audioFiles/'+videoId+'.mp3'
];

var tagger = avconv(metadata);

tagger.on('message', function(data) {
    process.stdout.write(data);

});

/*
   ffmetadata.write("audioFiles/"+videoId+".mp3", data, ["imageFiles/"+videoId+".jpg"], function(err) {
    if (err){
console.error("Error writing cover art");
console.log(err);
}
    else console.log("Cover art added");
});

var readStream = fs.createReadStream(filePath);



    tagger.on('exit', function() {


    var stat = fs.statSync(filePath);

    response.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size
    });


    readStream.pipe(response);
});

    console.log("response sent");
});
*/
    }



}).listen(8050);