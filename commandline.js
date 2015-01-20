//call this script like node commandline.js "tXtATeQ7GKg"
var path = require('path');
var converter = require("./converter");

var videoId = process.argv[2];

converter.setReadyCallback(function converterReady(){
converter.processVideoId(videoId, function callback(err, file){

        if(err){
            response.end();
            console.log(err);
        }else{
            var filePath = path.join(__dirname, "audioFiles/" + videoId + ".mp3");
            console.log(filePath);
        }

    });

});