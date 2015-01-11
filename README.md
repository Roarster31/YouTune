# YouTune

YouTune is a Node.js server that converts YouTube videos to mp3 files. Together with its companion Android app you can quickly and easily get music from YouTube.

### Usage

Usage is pretty straight forward.

```sh
$ node converter.js
```

and you're up and running!

The server by default runs on port 8050. The server accepts calls on this port and takes the query parameter as the YouTube video id. For example

http://localhost:8050?HeK1zQFJtXE fetches the YouTube video at http://www.youtube.com/watch?v=HeK1zQFJtXE

The server downloads the video and strips out the video stream leaving the audio stream intact while querying the spotify api for info about the music. It then writes the metadata to the music and returns it to the caller of the url request.
