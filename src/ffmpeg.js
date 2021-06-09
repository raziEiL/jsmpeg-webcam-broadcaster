const child_process = require("child_process");
const EventEmitter = require("events");
const path = require("path");
const FFMPEG_PATH = path.join(__dirname, "ffmpeg/ffmpeg.exe");
const argsFromOpts = (opts) => ["-f", "dshow", "-i", `video=${opts.device}`, "-r", `${opts.r}`, "-f", "mpegts", "-codec:v", "mpeg1video", "-b:v", `${opts.v}k`, "-bf", "0", "-headers", `Authorization: ${opts.auth}`, `${opts.url}`];
/*
* RegEx to get dshow lines
* [dshow @ 000001515b47d7c0] DirectShow video devices (some may be both video and audio devices)
* [dshow @ 000001515b47d7c0]  "DroidCam Source 3"
*/
const REGEX_DSHOW = /^\[dshow @ \S*/;
const REGEX_QUOTES = /"(.*)"/;
// frame=   20 fps=0.0 q=2.0 size=      16kB time=00:00:00.86 bitrate= 151.0kbits/s speed=1.72x
const REGEX_FRAME = /^frame=\s*(\d*)/;
const REGEX_SIZE = /size=\s*(\d*\w*)/;

/* Opts:
 * device: name of devies
 * r: framerate
 * v: bitrate (kb/sec)
 * auth: Authorization header password
 * url: server where to stream
 */
class FFmpeg extends EventEmitter {
    constructor(htmlElement, opts) {
        super();
        this.htmlElement = htmlElement;
        this.updateOpts(opts);
    }
    stop() {
        if (this.child) {
            // https://ru.wikipedia.org/wiki/%D0%A1%D0%B8%D0%B3%D0%BD%D0%B0%D0%BB_(Unix)
            this.child.kill("SIGKILL");
        }
    }
    run() {
        if (this.child)
            return;

        this.child = child_process.spawn(FFMPEG_PATH, argsFromOpts(this.opts));
        this.connected = false;
        this.emit("connection");

        this.child.stderr.on("data", (data) => {
            data = data.toString();
            if (!data) return;

            const frame = data.match(REGEX_FRAME);
            if (!frame || !frame[1]) return;

            const size = data.match(REGEX_SIZE);
            if (!size || !size[1]) return;

            // this is not a good way to detect is connection established
            if (!this.connected && frame[1] > 50) {
                this.connected = true;
                this.emit("connected");
            }
            if (this.connected && this.htmlElement)
                this.htmlElement.textContent = `frame: ${frame[1]}, size: ${size[1]}`;
        });

        this.child.on("close", (code) => {
            this.child = undefined;
            console.log(`ffmpeg process exited with code ${code}`);

            if (this.htmlElement)
                this.htmlElement.textContent = "";

            this.emit("disconnected");
        });
        //doesn't work with Electron
        /* 
        child.on("spawn", () => {
            this.child = child;
            this.spawning = false;
            console.log("spawn ffmpeg process");
            this.emit("spawn");
        });
        */
    }
    updateOpts(opts) {
        this.opts = opts ? Object.assign({}, opts) : {};
        console.log(this.opts);
        return this;
    }
    // Parse "ffmpeg -list_devices true -f dshow -i dummy" command output to get devices
    static getDevices() {
        return new Promise((res, rej) => {
            const devices = [];
            const process = child_process.exec(`${FFMPEG_PATH} -list_devices 1 -f dshow -i dummy`, (error, stdout, stderr) => {
                console.log(stderr);
                const lines = stderr.split("\r\n");

                for (const line of lines) {
                    // dshow lines without doublicates
                    if (!REGEX_DSHOW.test(line) || line.includes("Alternative name")) continue;

                    // grab only video devices
                    if (line.includes("DirectShow audio devices"))
                        break;

                    const match = line.match(REGEX_QUOTES);

                    if (match && match[1])
                        devices.push(match[1]);
                }
                res(devices);
            });
            process.on("error", rej);
        });
    }
}

module.exports = { FFmpeg };

/* Output from: ffmpeg -list_devices true -f dshow -i dummy

    ffmpeg version N-102545-g59032494e8 Copyright (c) 2000-2021 the FFmpeg developers
    built with gcc 10-win32 (GCC) 20210408
    configuration: --prefix=/ffbuild/prefix --pkg-config-flags=--static --pkg-config=pkg-config --cross-prefix=x86_64-w64-mingw32- --arch=x86_64 --target-os=mingw32 --enable-gpl --enable-version3 --disable-debug --enable-shared --disable-static --disable-w32threads --enable-pthreads --enable-iconv --enable-libxml2 --enable-zlib --enable-libfreetype --enable-libfribidi --enable-gmp --enable-lzma --enable-fontconfig --enable-libvorbis --enable-opencl --enable-libvmaf --enable-vulkan --enable-amf --enable-libaom --enable-avisynth --enable-libdav1d --enable-libdavs2 --enable-ffnvcodec --enable-cuda-llvm --enable-libglslang --enable-libgme --enable-libass --enable-libbluray --enable-libmp3lame --enable-libopus --enable-libtheora --enable-libvpx --enable-libwebp --enable-lv2 --enable-libmfx --enable-libopencore-amrnb --enable-libopencore-amrwb --enable-libopenjpeg --enable-librav1e --enable-librubberband --enable-schannel --enable-sdl2 --enable-libsoxr --enable-libsrt --enable-libsvtav1 --enable-libtwolame --enable-libuavs3d --enable-libvidstab --enable-libx264 --enable-libx265 --enable-libxavs2 --enable-libxvid --enable-libzimg --extra-cflags=-DLIBTWOLAME_STATIC --extra-cxxflags= --extra-ldflags=-pthread --extra-ldexeflags= --extra-libs=-lgomp
    libavutil      57.  0.100 / 57.  0.100
    libavcodec     59.  1.100 / 59.  1.100
    libavformat    59.  2.100 / 59.  2.100
    libavdevice    59.  0.100 / 59.  0.100
    libavfilter     8.  0.101 /  8.  0.101
    libswscale      6.  0.100 /  6.  0.100
    libswresample   4.  0.100 /  4.  0.100
    libpostproc    56.  0.100 / 56.  0.100
  [dshow @ 0000016c1590e340] DirectShow video devices (some may be both video and audio devices)
  [dshow @ 0000016c1590e340]  "DroidCam Source 3"
  [dshow @ 0000016c1590e340]     Alternative name "@device_pnp_\\?\root#media#0001#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\global"
  [dshow @ 0000016c1590e340]  "DroidCam Source 2"
  [dshow @ 0000016c1590e340]     Alternative name "@device_sw_{860BB310-5D01-11D0-BD3B-00A0C911CE86}\{9E2FBAC0-C951-4AA8-BFA9-4B196644964C}"
  [dshow @ 0000016c1590e340]  "OBS Virtual Camera"
  [dshow @ 0000016c1590e340]     Alternative name "@device_sw_{860BB310-5D01-11D0-BD3B-00A0C911CE86}\{A3FCE0F5-3493-419F-958A-ABA1250EC20B}"
  [dshow @ 0000016c1590e340] DirectShow audio devices
  [dshow @ 0000016c1590e340]  "Микрофон (WO Mic Device)"
  [dshow @ 0000016c1590e340]     Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\wave_{47560596-D1AA-4D3C-A62E-868565B9450B}"
  [dshow @ 0000016c1590e340]  "Микрофон (Realtek High Definition Audio)"
  [dshow @ 0000016c1590e340]     Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\wave_{433C0764-8897-471D-913F-FB512B430803}"
  [dshow @ 0000016c1590e340]  "Микрофон (DroidCam Virtual Audio)"
  [dshow @ 0000016c1590e340]     Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\wave_{834DE11B-D57C-4D9A-9C3D-94C8A8928F68}"
  dummy: Immediate exit requested
*/

