// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { FFmpeg } = require("./ffmpeg");
const fs = require("fs");
const config = require("../package.json");
const RECONNECTION_DELAY = 2000;
const RECONNECTION_COUNT = 3;
// parse cookie
let cookie;

try {
    cookie = fs.readFileSync("cookie.json");
    cookie = JSON.parse(cookie);
} catch { }

window.addEventListener("DOMContentLoaded", () => {
    const body = document.querySelector("body");
    const btn = document.querySelector("#submit");
    const stats = document.querySelector("#stats");
    const form = document.querySelector("form");
    const device = document.querySelector("#device");
    const url = document.querySelector("#url");
    const auth = document.querySelector("#auth");
    const team = document.querySelector("#team");
    const nickname = document.querySelector("#nickname");
    const fps = document.querySelector("#fps");
    const bitrate = document.querySelector("#bitrate");
    const version = document.querySelector("#version");
    version.textContent = config.version;

    const update = document.querySelector("#update-icon");
    update.addEventListener("click", updateDevices);
    updateDevices(true);

    // load cookie
    if (cookie) {
        if (cookie.r)
            fps.value = cookie.r;
        if (cookie.v)
            bitrate.value = cookie.v;
        if (cookie.auth)
            auth.value = cookie.auth;
        if (cookie.url)
            url.value = cookie.url;
        if (cookie.team)
            team.value = cookie.team;
        if (cookie.nickname)
            nickname.value = cookie.nickname;
        console.log("cookie loaded");
    }

    const ffmpeg = new FFmpeg(stats);
    let disconnectedByUser = false, reconnectCount = 0, timeout;

    ffmpeg.on("connection", () => {
        body.style.backgroundColor = "#44C3EE";
        btn.value = reconnectCount ? `Переподключение ${reconnectCount}/${RECONNECTION_COUNT}` : "Подключение...";
    });

    ffmpeg.on("connected", () => {
        body.style.backgroundColor = "#24F9C1";
        btn.value = "Остановить трансляцию";
        reconnectCount = 0;
    });

    ffmpeg.on("disconnected", () => {
        body.style.backgroundColor = "white";
        btn.value = "Запустить трансляцию";

        if (!disconnectedByUser && reconnectCount < RECONNECTION_COUNT) {
            timeout = setTimeout(() => {
                timeout = undefined;
                reconnectCount++;
                btn.click();
            }, RECONNECTION_DELAY);
        }
        else
            reconnectCount = 0;
    });

    form.addEventListener("submit", function (event) {
        if (timeout) {
            clearTimeout(timeout);
            reconnectCount = 0;
        }
        if (ffmpeg.child) {
            console.log("ffmpeg.stop()");
            disconnectedByUser = true;
            ffmpeg.stop();
        }
        else {
            console.log("ffmpeg.run()");
            disconnectedByUser = false;
            const obj = {
                device: device.options[device.selectedIndex].text,
                r: fps.value,
                v: bitrate.value,
                auth: auth.value,
                url: url.value,
                team: team.value,
                nickname: nickname.value
            };
            ffmpeg.updateOpts(obj).run();
            // store cookie
            fs.writeFile("cookie.json", JSON.stringify(obj), (err) => {
                if (err)
                    console.error(err);
            });
        }
        // blocks browser page reloads
        event.preventDefault();
    });
});

function updateDevices(firstLoad) {
    const element = document.querySelector("#device");
    element.textContent = ""; // clear elements

    FFmpeg.getDevices().then(devies => {
        // eslint-disable-next-line unicorn/no-for-loop
        for (let index = 0; index < devies.length; index++) {
            const option = window.document.createElement("option");
            option.textContent = devies[index];
            element.append(option);

            // load cookie
            if (firstLoad && cookie && cookie.device && cookie.device === devies[index])
                element.selectedIndex = index;
        }
    }).catch(console.error);
}
