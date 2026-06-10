// ==========================================================================
// 車流資料配置 (Traffic Data Configuration)
// ==========================================================================
const trafficData = {
    xinzhongbei: {
        name: "新中北路248巷與忠義路23巷",
        coords: [24.959447, 121.239866],
        isReserved: false,
        media: {
            morning: "./media/xinzhongbei_morning.mp4",
            afternoon: "./media/afternoon1.mp4",
            night: "./media/xinzhongbei_night.mp4"
        }
    }
};

// 時段索引與關鍵字映射
const timeKeys = ["morning", "afternoon", "night"];

// 當前狀態 (Application State)
let currentActiveLocationId = null;
let currentActiveTimeIndex = 0; // 預設為早上 (0: 早上, 1: 下午, 2: 晚上)

// ==========================================================================
// 地圖初始化 (Map Initialization)
// ==========================================================================

// 1. 取得所有監測點的座標
const markerCoords = Object.values(trafficData).map(loc => loc.coords);
const bounds = L.latLngBounds(markerCoords);

// 2. 設定極致契合觀測點的中心與縮放
const centerZhongli = [24.9589, 121.2388];
const optimalZoom = 17.0; // 💡 鎖定在 17.0 級高倍率縮放，路牌與街名清晰可見

// 3. 初始化地圖，鎖定最佳縮放與適度限制可拖曳區域，防止黑屏與卡死
const map = L.map('map', {
    zoomControl: true,
    minZoom: 17.0,               // 💡 限制最小縮放為 17.0，使用者無法縮小地圖，防範左右區域過大而失焦
    maxZoom: 18.0,               // 💡 嚴格限制最大縮放為 18.0，防範因無圖資導致的「地圖黑頻」問題
    zoomSnap: 0.1,               // 支援小數點細緻對焦
    zoomDelta: 0.5,
    maxBounds: bounds.pad(1.20), // 💡 邊界擴大至 120% 緩衝。這可以讓使用者放大後順暢地在校區街道拖曳移動，但又絕不會拖離中原大學範圍
    maxBoundsViscosity: 0.8      // 💡 邊界阻擋黏滯度調整為 0.8，拖到邊界時會有滑順的彈回感，體驗更自然、不易卡死
}).setView(centerZhongli, optimalZoom);

// 載入 OpenStreetMap 圖資
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// 💡 最佳實踐：確保地圖在儀表板容器渲染完成後重新計算大小，防灰色邊緣或不全
window.addEventListener('load', () => {
    setTimeout(() => {
        map.invalidateSize();
    }, 100);
});

// ==========================================================================
// DOM 元素選取 (DOM Element Selectors)
// ==========================================================================
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const closeModalBtn = document.getElementById('close-modal-btn');
const trafficVideo = document.getElementById('traffic-video');
const unmuteBtn = document.getElementById('unmute-btn');
const videoLoader = document.getElementById('video-loader');
const timeSlider = document.getElementById('time-slider');
const tabButtons = document.querySelectorAll('.time-tab-btn');
const ticks = document.querySelectorAll('.tick');

// ==========================================================================
// 自訂標記產生器 (Custom Leaflet Markers Generator)
// ==========================================================================
Object.keys(trafficData).forEach(key => {
    const loc = trafficData[key];

    // 依據是否為預留項目，設定不同的 CSS 類別
    const markerClass = loc.isReserved ? "custom-marker marker-reserved" : "custom-marker";

    // 建立 HTML 發光漣漪結構
    const customIcon = L.divIcon({
        className: markerClass,
        html: `
            <div class="marker-pin-wrapper">
                <div class="marker-ping-ring"></div>
                <div class="marker-core"></div>
            </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    // 建立 Leaflet 標記並加入地圖
    const marker = L.marker(loc.coords, { icon: customIcon }).addTo(map);

    // 設定懸浮文字提示 (Tooltip)
    marker.bindTooltip(loc.name, {
        direction: 'top',
        offset: [0, -10],
        className: 'custom-tooltip'
    });

    // 監聽標記點擊事件
    marker.on('click', () => {
        openTrafficModal(key);
    });
});

// ==========================================================================
// Modal 開關與多媒體控制 (Modal & Media Control)
// ==========================================================================

// 開啟資訊視窗
function openTrafficModal(locationId) {
    currentActiveLocationId = locationId;
    const loc = trafficData[locationId];

    // 1. 設定視窗標題
    modalTitle.textContent = loc.name;

    // 2. 開啟遮罩 (觸發 CSS transition 動畫)
    modalOverlay.classList.add('active');

    // 3. 根據當前選擇時段，載入並播放影片
    loadTrafficVideo();
}

// 關閉資訊視窗
function closeTrafficModal() {
    modalOverlay.classList.remove('active');

    // 暫停影片以節省頻寬與運算資源
    trafficVideo.pause();

    // 重設靜音狀態為靜音自動播放
    trafficVideo.muted = true;
    updateUnmuteButtonUI(true);

    currentActiveLocationId = null;
}

// 監聽關閉事件
closeModalBtn.addEventListener('click', closeTrafficModal);

// 點擊背景遮罩亦可關閉
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
        closeTrafficModal();
    }
});

// 支援 ESC 鍵關閉
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
        closeTrafficModal();
    }
});

// 載入對應時段的影片邏輯
function loadTrafficVideo() {
    if (!currentActiveLocationId) return;

    const loc = trafficData[currentActiveLocationId];
    const timeKey = timeKeys[currentActiveTimeIndex];
    const videoSrc = loc.media[timeKey];

    // 顯示載入動畫
    videoLoader.classList.add('active');

    // 設定影片來源
    trafficVideo.src = videoSrc;
    trafficVideo.load();

    // 當影片載入完成，可以順暢播放時
    trafficVideo.oncanplay = () => {
        videoLoader.classList.remove('active');

        // 瀏覽器通常會阻擋有聲音的影片自動播放，因此我們使用靜音播放
        const playPromise = trafficVideo.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("自動播放受到瀏覽器安全性策略限制:", error);
            });
        }
    };

    // 處理影片載入錯誤 (例如找不到檔案時，優雅提示)
    trafficVideo.onerror = () => {
        videoLoader.classList.remove('active');
        console.error(`影片載入失敗，請確認檔案是否存在於路徑: ${videoSrc}`);
    };
}

// 聲音開關控制 (靜音/解除靜音)
unmuteBtn.addEventListener('click', () => {
    // 翻轉靜音狀態
    trafficVideo.muted = !trafficVideo.muted;
    updateUnmuteButtonUI(trafficVideo.muted);
});

// 更新靜音按鈕的圖標與文字
function updateUnmuteButtonUI(isMuted) {
    if (isMuted) {
        unmuteBtn.innerHTML = `
            <i class="fa-solid fa-volume-xmark"></i>
            <span>開啟聲音</span>
        `;
        unmuteBtn.style.background = "rgba(15, 23, 42, 0.85)";
        unmuteBtn.style.color = "var(--text-primary)";
    } else {
        unmuteBtn.innerHTML = `
            <i class="fa-solid fa-volume-high"></i>
            <span>關閉聲音</span>
        `;
        unmuteBtn.style.background = "var(--primary-cyan)";
        unmuteBtn.style.color = "#020617";
    }
}

// ==========================================================================
// 控制面版：滑桿與分段按鈕連動邏輯 (Control Board Synchronization)
// ==========================================================================

// 統一狀態更新與畫面渲染
function updateTimeState(newTimeIndex) {
    if (currentActiveTimeIndex === newTimeIndex) return;

    currentActiveTimeIndex = newTimeIndex;

    // 1. 同步更新 Slider 的值
    timeSlider.value = newTimeIndex;

    // 2. 同步更新分段按鈕 (Tab Buttons) 的 Active 樣式
    tabButtons.forEach(btn => {
        const btnIndex = parseInt(btn.getAttribute('data-time-index'));
        if (btnIndex === newTimeIndex) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 3. 同步更新滑桿刻度 (Ticks) 的 Active 樣式
    ticks.forEach(tick => {
        const tickIndex = parseInt(tick.getAttribute('data-time-index'));
        if (tickIndex === newTimeIndex) {
            tick.classList.add('active');
        } else {
            tick.classList.remove('active');
        }
    });

    // 4. 動態抽換影片來源並播放
    loadTrafficVideo();
}

// 監聽滑桿 (Slider) 滑動與釋放事件
timeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    updateTimeState(value);
});

// 監聽時間分段按鈕 (Tab Buttons) 點擊事件
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-time-index'));
        updateTimeState(index);
    });
});

// 監聽文字刻度 (Ticks) 點擊事件 (提高易用性)
ticks.forEach(tick => {
    tick.addEventListener('click', () => {
        const index = parseInt(tick.getAttribute('data-time-index'));
        updateTimeState(index);
    });
});
