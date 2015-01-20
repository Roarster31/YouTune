var http = require("http");
var url = require("url");
var path = require('path');
var fs = require("fs");
var converter = require("./converter");

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

http.createServer(function(request, response) {

    var videoId = url.parse(request.url).query;

    converter.processVideoId(videoId, function callback(err, file){

        if(err){
            response.end();
            console.log(err);
        }else{
            sendAudioFile(videoId, response);
        }

    });

}).listen(8050);