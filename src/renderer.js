const { ipcRenderer, desktopCapturer } = require("electron");
import "./index.css";

console.log(
  '👋 This message is being logged by "renderer.js", included via webpack'
);

// const startButton = document.getElementById("startButton");
// const stopButton = document.getElementById("stopButton");
// const video = document.querySelector("video");
const fullScreenButton = document.getElementById("fullScreenButton");
const preview = document.querySelector("#preview");

// startButton.addEventListener("click", () => {
//   console.log("startButton clicked");
//   navigator.mediaDevices
//     .getDisplayMedia({
//       audio: true,
//       video: {
//         width: 320,
//         height: 240,
//         frameRate: 30,
//       },
//     })
//     .then((stream) => {
//       video.srcObject = stream;
//       video.onloadedmetadata = (e) => video.play();
//     })
//     .catch((e) => console.log(e));
// });

// stopButton.addEventListener("click", () => {
//   console.log("stopButton clicked");
//   video.pause();
// });

fullScreenButton.addEventListener("click", async () => {
  console.log("fullScreenButton clicked");

  const handleStream = (stream) => {
    console.log(stream);

    // Create hidden video tag
    const video = document.createElement("video");
    video.style.cssText = "position:absolute;top:-10000px;left:-10000px;";

    video.onloadedmetadata = () => {
      // Set video ORIGINAL height (screenshot)
      video.style.height = video.videoHeight + "px";
      video.style.width = video.videoWidth + "px";

      video.play();

      // Create canvas
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      // Draw video on canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      preview.setAttribute("src", canvas.toDataURL("image/png"));

      // Remove hidden video tag
      video.remove();

      try {
        // Destroy connect to stream
        stream.getTracks()[0].stop();
      } catch (e) {
        console.error("Error stopping stream:", e);
      }
    };

    video.srcObject = stream;
    document.body.appendChild(video);
  };

  navigator.mediaDevices
    .getDisplayMedia({
      audio: false,
      video: {
        width: 320,
        height: 240,
        frameRate: 30,
      },
    })
    .then((stream) => handleStream(stream))
    .catch((e) => {
      console.log(e);
    });

  //   desktopCapturer
  //     .getSources({ types: ["window", "screen"] })
  //     .then(async (sources) => {
  //       // const sources = await ipcRenderer.invoke("get-sources");
  //       console.log("Available sources:", sources);

  //       for (const source of sources) {
  //         // Filter: main screen
  //         if (source.name === document.title) {
  //           try {
  //             const stream = await navigator.mediaDevices.getUserMedia({
  //               audio: false,
  //               video: {
  //                 mandatory: {
  //                   chromeMediaSource: "desktop",
  //                   chromeMediaSourceId: source.id,
  //                   minWidth: 1280,
  //                   maxWidth: 4000,
  //                   minHeight: 720,
  //                   maxHeight: 4000,
  //                 },
  //               },
  //             });

  //             handleStream(stream);
  //           } catch (e) {
  //             console.error("Error getting user media:", e);
  //           }
  //         }
  //       }
  //     });
});
