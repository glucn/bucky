import "./index.css";

const fullScreenButton = document.getElementById("fullScreenButton");
const areaButton = document.getElementById("areaButton");
const preview = document.querySelector("#preview");

// Function to capture screenshot from a stream
const captureScreenshot = (stream, cropArea = null) => {
  const video = document.createElement("video");
  video.style.cssText = "position:absolute;top:-10000px;left:-10000px;";

  video.onloadedmetadata = () => {
    video.style.height = video.videoHeight + "px";
    video.style.width = video.videoWidth + "px";
    video.play();

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (cropArea) {
      // Set canvas size to the selected area
      canvas.width = cropArea.width;
      canvas.height = cropArea.height;
      // Draw only the selected area
      ctx.drawImage(
        video,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        cropArea.width,
        cropArea.height
      );
    } else {
      // Draw full screen
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    preview.setAttribute("src", canvas.toDataURL("image/png"));
    video.remove();

    try {
      stream.getTracks()[0].stop();
    } catch (e) {
      console.error("Error stopping stream:", e);
    }
  };

  video.srcObject = stream;
  document.body.appendChild(video);
};

// Function to handle area selection
const handleAreaSelection = (stream) => {
  const video = document.createElement("video");
  video.style.cssText = "position:absolute;top:-10000px;left:-10000px;";
  video.srcObject = stream;
  document.body.appendChild(video);

  video.onloadedmetadata = () => {
    video.style.height = video.videoHeight + "px";
    video.style.width = video.videoWidth + "px";
    video.play();

    // Create selection overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      cursor: crosshair;
      z-index: 9999;
    `;

    let isSelecting = false;
    let startX, startY;
    let selectionBox = null;

    overlay.addEventListener("mousedown", (e) => {
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;

      selectionBox = document.createElement("div");
      selectionBox.style.cssText = `
        position: fixed;
        border: 2px solid #fff;
        background: rgba(255, 255, 255, 0.1);
        pointer-events: none;
        z-index: 10000;
      `;
      document.body.appendChild(selectionBox);
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!isSelecting) return;

      const width = e.clientX - startX;
      const height = e.clientY - startY;

      selectionBox.style.left = `${width < 0 ? e.clientX : startX}px`;
      selectionBox.style.top = `${height < 0 ? e.clientY : startY}px`;
      selectionBox.style.width = `${Math.abs(width)}px`;
      selectionBox.style.height = `${Math.abs(height)}px`;
    });

    overlay.addEventListener("mouseup", (e) => {
      if (!isSelecting) return;
      isSelecting = false;

      const width = e.clientX - startX;
      const height = e.clientY - startY;

      const cropArea = {
        x: width < 0 ? e.clientX : startX,
        y: height < 0 ? e.clientY : startY,
        width: Math.abs(width),
        height: Math.abs(height),
      };

      // Clean up
      overlay.remove();
      selectionBox.remove();
      video.remove();

      // Capture the selected area
      captureScreenshot(stream, cropArea);
    });

    document.body.appendChild(overlay);
  };
};

// Full screen screenshot
fullScreenButton.addEventListener("click", () => {
  navigator.mediaDevices
    .getDisplayMedia({
      audio: false,
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
    })
    .then((stream) => captureScreenshot(stream))
    .catch((e) => console.error("Error capturing screenshot:", e));
});

// Area selection screenshot
areaButton.addEventListener("click", () => {
  navigator.mediaDevices
    .getDisplayMedia({
      audio: false,
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
    })
    .then((stream) => handleAreaSelection(stream))
    .catch((e) => console.error("Error capturing screenshot:", e));
});
