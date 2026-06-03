/**
 * ============================================================================
 * 2D 俯視平交道交通模擬核心系統 - 塞車路口修正版 (Taiwanese Level Crossing)
 * 技術棧: HTML5 Canvas, Vanilla JavaScript (OOP 物件導向)
 * ============================================================================
 */

// --- 聲音合成系統 (Web Audio API) ---
class CrossingAudio {
    constructor() {
        this.ctx = null;
        this.intervalId = null;
        this.isEnabled = true;
        this.isPlaying = false;
        this.step = 0; // 用於交替發聲 (叮咚)
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    start() {
        this.init();
        if (!this.isEnabled || this.isPlaying) return;
        this.isPlaying = true;
        this.step = 0;

        this.intervalId = setInterval(() => {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            this.playChime();
        }, 380); 
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isPlaying = false;
    }

    playChime() {
        if (!this.ctx || !this.isEnabled) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            const frequency = this.step % 2 === 0 ? 680 : 540;
            osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
            
            gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

            osc.type = 'triangle';
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.36);
            
            this.step++;
        } catch (e) {
            console.warn("音效播放失敗:", e);
        }
    }
}

const crossingSound = new CrossingAudio();

// --- 粒子特效系統 (排氣煙霧) ---
class Particle {
    constructor(x, y, vx, vy, size, color) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.size = size;
        this.color = color;
        this.alpha = 1.0;
        this.life = 1.0;
        this.decay = 0.025 + Math.random() * 0.025;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
        this.life -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha * 0.35);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// --- 基礎移動物件類別 (Agent) ---
class Agent {
    constructor(x, y, width, height, maxSpeed, color, direction) {
        this.x = x;
        this.y = y;
        this.width = width;   
        this.height = height; 
        this.speed = 0;           
        this.maxSpeed = maxSpeed;  
        this.targetSpeed = maxSpeed;
        this.acceleration = 0.12;  
        this.deceleration = 0.24;  
        this.color = color;
        this.braking = false;     
        this.id = Math.random().toString(36).substr(2, 9);
        
        // 轉彎狀態機
        this.spawnDirection = direction; // 'left' | 'right'
        this.state = 'horizontal';       
        
        // 朝向角：0:向右, Math.PI:向左, -Math.PI/2:向上
        this.angle = direction === 'left' ? 0 : Math.PI;
    }

    update(simSpeed, turnCenterX, laneCenterX) {
        if (this.speed < this.targetSpeed) {
            this.speed = Math.min(this.targetSpeed, this.speed + this.acceleration * simSpeed);
        } else if (this.speed > this.targetSpeed) {
            this.speed = Math.max(this.targetSpeed, this.speed - this.deceleration * simSpeed);
        }

        // 狀態機行為更新
        if (this.state === 'horizontal') {
            if (this.spawnDirection === 'left') {
                this.x += this.speed * simSpeed;
                this.angle = 0;
                if (this.x >= turnCenterX - 30) {
                    this.state = 'turning';
                }
            } else {
                this.x -= this.speed * simSpeed;
                this.angle = Math.PI;
                if (this.x <= turnCenterX + 30) {
                    this.state = 'turning';
                }
            }
        } 
        else if (this.state === 'turning') {
            const turnRate = 0.085 * simSpeed;
            if (this.spawnDirection === 'left') {
                this.angle -= turnRate;
                if (this.angle <= -Math.PI / 2) {
                    this.angle = -Math.PI / 2;
                    this.state = 'vertical';
                    if (this.type === 'Pedestrian') {
                        this.x = laneCenterX;
                    } else {
                        this.x = laneCenterX - 4 + Math.random() * 8;
                    }
                }
            } else {
                this.angle += turnRate;
                if (this.angle >= Math.PI * 1.5 || this.angle <= -Math.PI / 2) {
                    this.angle = -Math.PI / 2;
                    this.state = 'vertical';
                    if (this.type === 'Pedestrian') {
                        this.x = laneCenterX;
                    } else {
                        this.x = laneCenterX - 4 + Math.random() * 8;
                    }
                }
            }

            this.x += this.speed * Math.cos(this.angle) * simSpeed;
            this.y += this.speed * Math.sin(this.angle) * simSpeed;
        } 
        else if (this.state === 'vertical') {
            this.y -= this.speed * simSpeed;
            this.angle = -Math.PI / 2;
            if (this.type === 'Pedestrian') {
                this.x = laneCenterX;
            }
        }
    }

    drawShadow(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.ellipse(3, 4, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// --- 汽車子類別 (Car) ---
class Car extends Agent {
    constructor(x, y, maxSpeed, color, direction) {
        super(x, y, 52, 30, maxSpeed, color, direction);
        this.type = 'Car';
        this.wheelColor = '#111827';
        this.hasSunroof = Math.random() > 0.4;
    }

    draw(ctx) {
        this.drawShadow(ctx);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // 1. 輪胎 (水平長方形)
        ctx.fillStyle = this.wheelColor;
        ctx.fillRect(-18, -this.height/2 - 2, 8, 3.5); 
        ctx.fillRect(10, -this.height/2 - 2, 8, 3.5);  
        ctx.fillRect(-18, this.height/2 - 1.5, 8, 3.5); 
        ctx.fillRect(10, this.height/2 - 1.5, 8, 3.5);  

        // 2. 車身
        ctx.fillStyle = this.color;
        this.drawRoundedRect(ctx, -this.width/2, -this.height/2, this.width, this.height, 6);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 3. 玻璃窗
        ctx.fillStyle = '#111827';
        ctx.fillRect(8, -this.height/2 + 3, 5, this.height - 6);  
        ctx.fillRect(-13, -this.height/2 + 3, 4, this.height - 6); 
        
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-8, -this.height/2 + 1, 14, 1.5);  
        ctx.fillRect(-8, this.height/2 - 2.5, 14, 1.5); 

        if (this.hasSunroof) {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(-6, -this.height/4, 10, this.height/2);
        }

        // 5. 大燈 (右側前端)
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(this.width/2 - 2, -this.height/2 + 3, 2, 4);
        ctx.fillRect(this.width/2 - 2, this.height/2 - 7, 2, 4);

        // 6. 後煞車尾燈
        if (this.braking) {
            ctx.fillStyle = '#ff2a4b';
            ctx.shadowColor = '#ff2a4b';
            ctx.shadowBlur = 6;
            ctx.fillRect(-this.width/2, -this.height/2 + 2, 2.5, 5);
            ctx.fillRect(-this.width/2, this.height/2 - 7, 2.5, 5);
        } else {
            ctx.fillStyle = '#991b1b';
            ctx.fillRect(-this.width/2, -this.height/2 + 2, 1.5, 4);
            ctx.fillRect(-this.width/2, this.height/2 - 6, 1.5, 4);
        }

        ctx.restore();
    }

    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}

// --- 機車子類別 (Motorcycle) ---
class Motorcycle extends Agent {
    constructor(x, y, maxSpeed, color, direction) {
        super(x, y, 24, 12, maxSpeed, color, direction);
        this.type = 'Motorcycle';
        this.wanderOffset = Math.random() * Math.PI * 2;
        this.helmetColor = color;
    }

    draw(ctx) {
        this.drawShadow(ctx);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-this.width/2, -2.5, this.width, 5);

        ctx.fillStyle = this.helmetColor;
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(-1, -1.5, 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-2, -5.5);
        ctx.lineTo(4, -3.5);
        ctx.moveTo(-2, 5.5);
        ctx.lineTo(4, 3.5);
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-this.width/2, -3, 2.5, 6);

        if (this.braking) {
            ctx.fillStyle = '#ff2a4b';
            ctx.shadowColor = '#ff2a4b';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(-this.width/2 + 1, 0, 2.5, 0, Math.PI*2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#991b1b';
            ctx.fillRect(-this.width/2, -1.5, 1.5, 3);
        }

        ctx.restore();
    }
}

// --- 行人子類別 (Pedestrian) ---
class Pedestrian extends Agent {
    constructor(x, y, maxSpeed, color, direction, roadBorders) {
        super(x, y, 8, 8, maxSpeed, color, direction);
        this.type = 'Pedestrian';
        this.swingOffset = Math.random() * Math.PI * 2;
        
        this.horizBorderY = roadBorders.horizY; 
        this.vertBorderX = roadBorders.vertX;   
        
        this.y = this.horizBorderY; 
    }

    update(simSpeed, turnCenterX, laneCenterX) {
        if (this.speed < this.targetSpeed) {
            this.speed = Math.min(this.targetSpeed, this.speed + this.acceleration * simSpeed);
        } else if (this.speed > this.targetSpeed) {
            this.speed = Math.max(this.targetSpeed, this.speed - this.deceleration * simSpeed);
        }

        if (this.state === 'horizontal') {
            this.y = this.horizBorderY; 
            if (this.spawnDirection === 'left') {
                this.x += this.speed * simSpeed;
                this.angle = 0;
                if (this.x >= this.vertBorderX - 8) {
                    this.state = 'turning';
                }
            } else {
                this.x -= this.speed * simSpeed;
                this.angle = Math.PI;
                if (this.x <= this.vertBorderX + 8) {
                    this.state = 'turning';
                }
            }
        }
        else if (this.state === 'turning') {
            const turnRate = 0.09 * simSpeed;
            if (this.spawnDirection === 'left') {
                this.angle -= turnRate;
                if (this.angle <= -Math.PI / 2) {
                    this.angle = -Math.PI / 2;
                    this.state = 'vertical';
                    this.x = this.vertBorderX; 
                }
            } else {
                this.angle += turnRate;
                if (this.angle >= Math.PI * 1.5 || this.angle <= -Math.PI / 2) {
                    this.angle = -Math.PI / 2;
                    this.state = 'vertical';
                    this.x = this.vertBorderX; 
                }
            }

            this.x += this.speed * Math.cos(this.angle) * simSpeed;
            this.y += this.speed * Math.sin(this.angle) * simSpeed;
        }
        else if (this.state === 'vertical') {
            this.y -= this.speed * simSpeed;
            this.x = this.vertBorderX; 
            this.angle = -Math.PI / 2;
        }
    }

    draw(ctx) {
        this.drawShadow(ctx);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        const swing = Math.sin(Date.now() * 0.015 + this.swingOffset) * 1.2;

        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 4; 
        ctx.beginPath();
        ctx.arc(swing, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(swing, 1.8, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// --- 火車類別 (Train) ---
class Train {
    constructor(y, direction, speed, type) {
        this.y = y;
        this.direction = direction; 
        this.speed = speed;
        this.type = type;
        this.length = type === 'high-speed' ? 620 : 460;
        this.width = 24;

        this.x = direction === 1 ? -this.length : 550 + this.length;
        
        if (type === 'high-speed') {
            this.bodyColor = '#f3f4f6';
            this.stripeColor = '#ea580c';
        } else {
            this.bodyColor = '#0284c7';
            this.stripeColor = '#eab308';
        }
    }

    update(simSpeed) {
        this.x += this.speed * this.direction * simSpeed;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(-this.length/2 + 5, 5, this.length, this.width);

        ctx.fillStyle = this.bodyColor;
        ctx.fillRect(-this.length/2, -this.width/2, this.length, this.width);

        const noseLen = 30;
        if (this.direction === 1) {
            ctx.beginPath();
            ctx.moveTo(this.length/2, -this.width/2);
            ctx.lineTo(this.length/2 + noseLen, 0);
            ctx.lineTo(this.length/2, this.width/2);
            ctx.closePath();
            ctx.fillStyle = this.bodyColor;
            ctx.fill();

            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.moveTo(this.length/2 - 10, -this.width/2 + 3);
            ctx.lineTo(this.length/2 + 10, 0);
            ctx.lineTo(this.length/2 - 10, this.width/2 - 3);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(-this.length/2, -this.width/2);
            ctx.lineTo(-this.length/2 - noseLen, 0);
            ctx.lineTo(-this.length/2, this.width/2);
            ctx.closePath();
            ctx.fillStyle = this.bodyColor;
            ctx.fill();

            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.moveTo(-this.length/2 + 10, -this.width/2 + 3);
            ctx.lineTo(-this.length/2 - 10, 0);
            ctx.lineTo(-this.length/2 + 10, this.width/2 - 3);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = this.stripeColor;
        ctx.fillRect(-this.length/2, -3, this.length, 6);

        ctx.fillStyle = '#374151';
        const carCount = this.type === 'high-speed' ? 6 : 4;
        const carLen = this.length / carCount;
        for (let i = 1; i < carCount; i++) {
            const cx = -this.length/2 + i * carLen;
            ctx.fillRect(cx - 3, -this.width/2, 6, this.width);
        }

        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 2;
        for (let i = 0; i < carCount; i++) {
            const startX = -this.length/2 + i * carLen + 10;
            const endX = -this.length/2 + (i + 1) * carLen - 10;
            const windowSpacing = 16;
            for (let wx = startX; wx < endX - 8; wx += windowSpacing) {
                ctx.fillRect(wx, -this.width/2 + 3, 7, 4);
                ctx.fillRect(wx, this.width/2 - 7, 7, 4);
            }
        }

        ctx.restore();
    }

    isOffScreen() {
        if (this.direction === 1) {
            return this.x - this.length/2 - 50 > 550;
        } else {
            return this.x + this.length/2 + 50 < 0;
        }
    }
}

// --- 模擬主控制核心 (Simulation Engine) ---
class Simulation {
    constructor() {
        this.canvas = document.getElementById('trafficCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 設定 Canvas 邏輯尺寸
        this.logicalWidth = 550;
        this.logicalHeight = 650;
        this.initCanvasDPI();

        // 幾何佈局
        this.laneWidth = 48; 
        this.verticalLaneX = 275; 
        this.roadLeft = this.verticalLaneX - this.laneWidth / 2; // 251
        this.roadRight = this.verticalLaneX + this.laneWidth / 2; // 299

        // 鐵道上移 (視角聚焦在塞車區域)
        this.track1Y = 100; // 北軌
        this.track2Y = 140; // 南軌
        this.stopLineY = 185; 

        // 底部水平車道 (T字路口)
        this.horizontalRoadY = 560; 
        this.horizRoadWidth = 66; 
        this.horizRoadTop = this.horizontalRoadY - this.horizRoadWidth / 2; // 527
        this.horizRoadBottom = this.horizontalRoadY + this.horizRoadWidth / 2; // 593

        // 模擬狀態
        this.gateState = 'OPEN';
        this.gateAngle = 90;
        
        // 動態物件
        this.agents = [];
        this.trains = [];
        this.particles = [];

        // 控制參數
        this.simSpeed = 1.0;
        this.densityLevel = 2;
        this.motoRatio = 0.70;
        this.pedRatio = 0.20;

        // 自訂倒計時關閉時間
        this.gateWaitDuration = 15;
        this.gateCountdownSec = 0;   
        this.countdownActive = false;
        this.countdownTimerId = null;

        // 生成定時器
        this.spawnTimer = 0;

        // 統計數據
        this.passedCount = 0;
        this.maxQueueCount = 0;
        this.currentQueueCount = 0;

        // 警示燈雙閃
        this.flasherTimer = 0;
        this.flasherActive = false;

        // 自動火車調度排程
        this.autoTrainTimer = 0;

        this.initEventListeners();
    }

    initCanvasDPI() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.logicalWidth * dpr;
        this.canvas.height = this.logicalHeight * dpr;
        this.ctx.scale(dpr, dpr);
        
        this.canvas.style.width = this.logicalWidth + 'px';
        this.canvas.style.height = this.logicalHeight + 'px';
    }

    initEventListeners() {
        const btnGate = document.getElementById('btn-gate-toggle');
        const btnTrain = document.getElementById('btn-spawn-train');

        btnGate.addEventListener('click', () => {
            crossingSound.init();

            if (this.gateState === 'OPEN' || this.gateState === 'OPENING') {
                this.gateState = 'CLOSING';
                btnGate.className = 'btn-primary gate-closed';
                btnGate.querySelector('.btn-text').innerText = '🚨 放下柵欄 (倒數中)';
                btnTrain.disabled = false;
                crossingSound.start();
                this.flasherActive = true;
                this.startCountdown();
            } else {
                this.cancelCountdown();
                this.gateState = 'OPENING';
                btnGate.className = 'btn-primary gate-open';
                btnGate.querySelector('.btn-text').innerText = '🔔 柵欄升起 (安全通行)';
                btnTrain.disabled = true;
                crossingSound.stop();
                this.flasherActive = false;
                this.resetFlasherBulbs();
            }
        });

        btnTrain.addEventListener('click', () => {
            this.spawnManualTrain();
        });

        const slideDensity = document.getElementById('slide-density');
        const valDensity = document.getElementById('val-density');
        slideDensity.addEventListener('input', (e) => {
            this.densityLevel = parseInt(e.target.value);
            const textMap = { 1: '低', 2: '中', 3: '高' };
            valDensity.innerText = textMap[this.densityLevel];
        });

        const slideWait = document.getElementById('slide-wait-time');
        const valWait = document.getElementById('val-wait-time');
        slideWait.addEventListener('input', (e) => {
            this.gateWaitDuration = parseInt(e.target.value);
            valWait.innerText = e.target.value + '秒';
        });

        const slideSpeed = document.getElementById('slide-speed');
        const valSpeed = document.getElementById('val-speed');
        slideSpeed.addEventListener('input', (e) => {
            this.simSpeed = parseFloat(e.target.value);
            valSpeed.innerText = this.simSpeed.toFixed(1) + 'x';
        });

        const slideMoto = document.getElementById('slide-moto-ratio');
        const valMoto = document.getElementById('val-moto-ratio');
        slideMoto.addEventListener('input', (e) => {
            this.motoRatio = parseInt(e.target.value) / 100;
            valMoto.innerText = e.target.value + '%';
        });

        const slidePed = document.getElementById('slide-ped-ratio');
        const valPed = document.getElementById('val-ped-ratio');
        slidePed.addEventListener('input', (e) => {
            this.pedRatio = parseInt(e.target.value) / 100;
            valPed.innerText = e.target.value + '%';
        });

        const switchSound = document.getElementById('switch-sound');
        switchSound.addEventListener('change', (e) => {
            crossingSound.isEnabled = e.target.checked;
        });

        window.addEventListener('resize', () => this.initCanvasDPI());
    }

    startCountdown() {
        this.cancelCountdown();
        this.countdownActive = true;
        this.gateCountdownSec = this.gateWaitDuration;
        
        const countdownEl = document.getElementById('gate-countdown');
        const countdownSecEl = document.getElementById('countdown-sec');
        
        countdownEl.style.display = 'flex';
        countdownSecEl.innerText = this.padZero(this.gateCountdownSec);

        this.countdownTimerId = setInterval(() => {
            if (this.gateCountdownSec > 0) {
                this.gateCountdownSec--;
                countdownSecEl.innerText = this.padZero(this.gateCountdownSec);
            } else {
                this.tryAutoOpenGate();
            }
        }, 1000);
    }

    cancelCountdown() {
        if (this.countdownTimerId) {
            clearInterval(this.countdownTimerId);
            this.countdownTimerId = null;
        }
        this.countdownActive = false;
        document.getElementById('gate-countdown').style.display = 'none';
    }

    tryAutoOpenGate() {
        if (this.trains.length > 0) {
            document.getElementById('countdown-sec').innerText = "WAIT";
            return;
        }

        this.cancelCountdown();
        this.gateState = 'OPENING';
        
        const btnGate = document.getElementById('btn-gate-toggle');
        btnGate.className = 'btn-primary gate-open';
        btnGate.querySelector('.btn-text').innerText = '🔔 柵欄升起 (安全通行)';
        
        const btnTrain = document.getElementById('btn-spawn-train');
        btnTrain.disabled = true;
        
        crossingSound.stop();
        this.flasherActive = false;
        this.resetFlasherBulbs();
    }

    padZero(num) {
        return num < 10 ? '0' + num : num;
    }

    resetFlasherBulbs() {
        document.getElementById('flasher-left').classList.remove('active-red');
        document.getElementById('flasher-right').classList.remove('active-red');
    }

    spawnManualTrain() {
        const tracksAvailable = [];
        const t1Busy = this.trains.some(t => t.y === this.track1Y && Math.abs(t.x) < 220);
        if (!t1Busy) tracksAvailable.push(1);

        const t2Busy = this.trains.some(t => t.y === this.track2Y && Math.abs(t.x - 550) < 220);
        if (!t2Busy) tracksAvailable.push(2);

        if (tracksAvailable.length === 0) return;

        const choice = tracksAvailable[Math.floor(Math.random() * tracksAvailable.length)];
        const trainType = Math.random() > 0.4 ? 'high-speed' : 'local';
        const trainSpeed = trainType === 'high-speed' ? 12 : 7.5;

        if (choice === 1) {
            this.trains.push(new Train(this.track1Y, 1, trainSpeed, trainType));
        } else {
            this.trains.push(new Train(this.track2Y, -1, trainSpeed, trainType));
        }
    }

    spawnTraffic(simSpeed) {
        this.spawnTimer += simSpeed;
        const baseInterval = { 1: 100, 2: 45, 3: 18 }[this.densityLevel];
        
        if (this.spawnTimer >= baseInterval) {
            const spawnDir = Math.random() > 0.5 ? 'left' : 'right';
            const startX = spawnDir === 'left' ? -35 : 585;
            const startY = spawnDir === 'left' ? this.horizontalRoadY - this.horizRoadWidth / 4 : this.horizontalRoadY + this.horizRoadWidth / 4;

            // 生成保護
            let isBlocked = false;
            for (let agent of this.agents) {
                const dist = Math.hypot(agent.x - startX, agent.y - startY);
                if (dist < 62) {
                    isBlocked = true;
                    break;
                }
            }
            
            if (isBlocked) {
                return; 
            }

            this.spawnTimer = 0;

            const rand = Math.random();
            if (rand < this.pedRatio) {
                const walkTopLine = Math.random() > 0.5;
                const borderConfig = {
                    horizY: walkTopLine ? this.horizRoadTop - 10 : this.horizRoadBottom + 10,
                    vertX: spawnDir === 'left' ? this.roadLeft - 12 : this.roadRight + 12
                };
                
                const pedColor = '#ec4899';
                this.agents.push(new Pedestrian(startX, borderConfig.horizY, 0.7 + Math.random() * 0.25, pedColor, spawnDir, borderConfig));
            } else {
                const isMoto = Math.random() < this.motoRatio;
                if (isMoto) {
                    const offset = Math.random() * 14 - 7;
                    const speed = 2.4 + Math.random() * 0.8;
                    const motoColor = '#f97316';
                    this.agents.push(new Motorcycle(startX, startY + offset, speed, motoColor, spawnDir));
                } else {
                    const speed = 1.6 + Math.random() * 0.6;
                    const carColor = '#0ea5e9';
                    this.agents.push(new Car(startX, startY, speed, carColor, spawnDir));
                }
            }
        }
    }

    // ========================================================================
    // 物理與跟車、避讓的核心演算法 (路徑感知向量防撞模型)
    // ========================================================================
    applyTrafficAI() {
        let totalQueueThisFrame = 0;

        for (let i = 0; i < this.agents.length; i++) {
            const self = this.agents[i];
            self.targetSpeed = self.maxSpeed;
            self.braking = false;

            // 1. 垂直單線道上的平交道阻截
            if (self.state === 'vertical') {
                // 判斷是否有火車正在通過或即將接近路口（給予安全緩衝距離，避免車輛來不及煞車）
                const isTrainDanger = this.trains.some(train => {
                    const safetyBuffer = 150;
                    if (train.direction === 1) {
                        return (train.x + train.length/2 + 20 >= this.roadLeft - safetyBuffer) && 
                               (train.x - train.length/2 - 20 <= this.roadRight);
                    } else {
                        return (train.x - train.length/2 - 20 <= this.roadRight + safetyBuffer) && 
                               (train.x + train.length/2 + 20 >= this.roadLeft);
                    }
                });

                if (((this.gateState === 'CLOSED' || this.gateState === 'CLOSING') || isTrainDanger) && self.y > this.stopLineY) {
                    const distToStop = self.y - this.stopLineY;
                    const decelerationDistance = self.type === 'Car' ? 120 : (self.type === 'Motorcycle' ? 80 : 40);
                    const stopBuffer = self.width / 2 + 10; 

                    if (distToStop < decelerationDistance) {
                        if (distToStop <= stopBuffer) {
                            self.targetSpeed = 0;
                            self.speed = 0;
                            self.braking = true;
                        } else {
                            const ratio = (distToStop - stopBuffer) / (decelerationDistance - stopBuffer);
                            self.targetSpeed = self.maxSpeed * Math.max(0, ratio * 0.7);
                            self.braking = true;
                        }
                    }
                }
            }

            // 2. 空間路徑障礙物偵測 (利用向量投影)
            let leadAgent = null;
            let minDistAhead = Infinity;

            const cosA = Math.cos(self.angle);
            const sinA = Math.sin(self.angle);

            for (let j = 0; j < this.agents.length; j++) {
                if (i === j) continue;
                const other = this.agents[j];

                const dx = other.x - self.x;
                const dy = other.y - self.y;

                const longDist = dx * cosA + dy * sinA;
                const latDist = -dx * sinA + dy * cosA;

                if (longDist > 0) {
                    const combinedPhysicalWidth = (self.height + other.height) / 2;
                    
                    let latThreshold = combinedPhysicalWidth + 2;
                    if (self.type === 'Car' || other.type === 'Car') {
                        latThreshold = combinedPhysicalWidth + 4; 
                    } else {
                        latThreshold = combinedPhysicalWidth - 0.8; 
                    }

                    if (Math.abs(latDist) < latThreshold) {
                        const actualGap = longDist - (self.width + other.width) / 2;
                        
                        if (actualGap > -5 && actualGap < minDistAhead) {
                            minDistAhead = actualGap;
                            leadAgent = other;
                        }
                    }
                }
            }

            // 3. 丁字路口回堵防堵塞邏輯
            if ((self.state === 'horizontal' || self.state === 'turning')) {
                let intersectionBlocked = false;
                for (let other of this.agents) {
                    if (other.state === 'vertical' && other.y > 505 && other.y < 575) {
                        intersectionBlocked = true;
                        break;
                    }
                }

                if (intersectionBlocked) {
                    const distToTurnCenter = Math.abs(self.x - this.verticalLaneX);
                    if (distToTurnCenter < 46) {
                        const gap = distToTurnCenter - 15;
                        if (gap < minDistAhead) {
                            minDistAhead = Math.max(0, gap);
                            leadAgent = { speed: 0 };
                        }
                    }
                }
            }

            // 4. 防防撞煞車控制
            if (leadAgent) {
                const safetyFactor = self.type === 'Car' ? 1.3 : 0.85;
                const baseSafetyDist = self.type === 'Car' ? 24 : (self.type === 'Motorcycle' ? 11 : 7);
                const safeLongDist = baseSafetyDist + (self.speed * 8 * safetyFactor); 
                const criticalStopDist = self.type === 'Car' ? 11 : (self.type === 'Motorcycle' ? 6 : 4);

                if (minDistAhead < safeLongDist) {
                    if (minDistAhead <= criticalStopDist) {
                        self.targetSpeed = Math.min(leadAgent.speed * 0.4, self.targetSpeed);
                        if (minDistAhead < criticalStopDist * 0.7) {
                            self.speed = 0;
                            self.targetSpeed = 0;
                        }
                        self.braking = true;
                    } else {
                        const factor = (minDistAhead - criticalStopDist) / (safeLongDist - criticalStopDist);
                        self.targetSpeed = Math.min(leadAgent.speed + (self.maxSpeed - leadAgent.speed) * factor * 0.85, self.targetSpeed);
                        self.braking = true;
                    }
                }
            }

            // 計入塞車統計指標 (極低速且在停止線以下)
            if (self.braking && self.speed < 0.15 && self.y > this.stopLineY - 20) {
                totalQueueThisFrame++;
            }

            // ====================================================================
            // 5. 單線道機車靈活沿邊鑽車縫邏輯
            // ====================================================================
            if (self.type === 'Motorcycle' && self.state === 'vertical') {
                if (self.braking && self.speed < self.maxSpeed * 0.6) {
                    const escapeSides = [this.roadLeft + 7, this.roadRight - 7];
                    let bestX = self.x;
                    let bestClearance = minDistAhead;

                    for (let testX of escapeSides) {
                        let testMinDist = Infinity;
                        for (let j = 0; j < this.agents.length; j++) {
                            if (i === j) continue;
                            const other = this.agents[j];
                            if (other.state !== 'vertical' || other.y >= self.y) continue;

                            const combinedW = (self.height + other.height) / 2;
                            const latDiff = Math.abs(testX - other.x);
                            
                            if (latDiff < combinedW - 1.5) {
                                const dist = (self.y - self.width/2) - (other.y + other.width/2);
                                if (dist > 0 && dist < testMinDist) {
                                    testMinDist = dist;
                                }
                            }
                        }

                        if (testMinDist > bestClearance && testMinDist > 20) {
                            bestClearance = testMinDist;
                            bestX = testX;
                        }
                    }

                    if (bestX !== self.x) {
                        self.vx = (bestX - self.x) * 0.15;
                        self.x += self.vx * this.simSpeed;
                        self.targetSpeed = Math.min(self.maxSpeed, self.speed + 0.45);
                        self.braking = false;
                    }
                }
            }
        }

        this.currentQueueCount = totalQueueThisFrame;
        if (this.currentQueueCount > this.maxQueueCount) {
            this.maxQueueCount = this.currentQueueCount;
        }
    }

    // ========================================================================
    // 【深度優化：多圓實體物理排斥 separation 算式】
    // 完全杜絕停等平交道時，汽機車、行人間的重合、重疊或穿模現象！
    // ========================================================================
    resolveCollisions() {
        const getCircles = (agent) => {
            const cosA = Math.cos(agent.angle);
            const sinA = Math.sin(agent.angle);

            if (agent.type === 'Car') {
                const offset = 14; 
                return [
                    { x: agent.x + cosA * offset, y: agent.y + sinA * offset, r: 14.5 }, 
                    { x: agent.x - cosA * offset, y: agent.y - sinA * offset, r: 14.5 }  
                ];
            } else if (agent.type === 'Motorcycle') {
                return [
                    { x: agent.x, y: agent.y, r: 7.2 }
                ];
            } else {
                return [
                    { x: agent.x, y: agent.y, r: 3.8 }
                ];
            }
        };

        for (let i = 0; i < this.agents.length; i++) {
            const a = this.agents[i];
            const circlesA = getCircles(a);

            for (let j = i + 1; j < this.agents.length; j++) {
                const b = this.agents[j];
                const circlesB = getCircles(b);

                let collided = false;
                let minOverlap = 0;
                let pushX = 0;
                let pushY = 0;

                for (let cA of circlesA) {
                    for (let cB of circlesB) {
                        const dx = cA.x - cB.x;
                        const dy = cA.y - cB.y;
                        const dist = Math.hypot(dx, dy);
                        const minDist = cA.r + cB.r;

                        if (dist < minDist && dist > 0.01) {
                            const overlap = minDist - dist;
                            if (!collided || overlap > minOverlap) {
                                minOverlap = overlap;
                                pushX = dx / dist; 
                                pushY = dy / dist; 
                                collided = true;
                            }
                        }
                    }
                }

                if (collided && minOverlap > 0.05) {
                    let weightFactorA = 0.5;
                    let weightFactorB = 0.5;

                    if (a.type === 'Car' && b.type === 'Motorcycle') {
                        weightFactorA = 0.03; 
                        weightFactorB = 0.97; 
                    } else if (a.type === 'Motorcycle' && b.type === 'Car') {
                        weightFactorA = 0.97;
                        weightFactorB = 0.03;
                    } else if (a.type === 'Car' && b.type === 'Pedestrian') {
                        weightFactorA = 0.0;  
                        weightFactorB = 1.0;  
                    } else if (a.type === 'Pedestrian' && b.type === 'Car') {
                        weightFactorA = 1.0;
                        weightFactorB = 0.0;
                    } else if (a.type === 'Motorcycle' && b.type === 'Pedestrian') {
                        weightFactorA = 0.05;
                        weightFactorB = 0.95;
                    } else if (a.type === 'Pedestrian' && b.type === 'Motorcycle') {
                        weightFactorA = 0.95;
                        weightFactorB = 0.05;
                    }

                    a.x += pushX * minOverlap * weightFactorA;
                    a.y += pushY * minOverlap * weightFactorA;
                    b.x -= pushX * minOverlap * weightFactorB;
                    b.y -= pushY * minOverlap * weightFactorB;
                }
            }

            if (a.type === 'Pedestrian') {
                if (a.state === 'vertical') {
                    a.x = a.vertBorderX; 
                } else if (a.state === 'horizontal') {
                    a.y = a.horizBorderY; 
                }
            } 
            else {
                if (a.state === 'vertical') {
                    const carOffset = a.type === 'Car' ? 15 : 6;
                    a.x = Math.max(this.roadLeft + carOffset, Math.min(this.roadRight - carOffset, a.x));
                } else if (a.state === 'horizontal') {
                    const carOffset = a.type === 'Car' ? 15 : 6;
                    a.y = Math.max(this.horizRoadTop + carOffset, Math.min(this.horizRoadBottom - carOffset, a.y));
                }
            }
        }
    }

    updateGate(simSpeed) {
        if (this.gateState === 'CLOSING') {
            if (this.gateAngle > 0) {
                this.gateAngle = Math.max(0, this.gateAngle - 2.5 * simSpeed);
            } else {
                this.gateState = 'CLOSED';
            }
        } else if (this.gateState === 'OPENING') {
            if (this.gateAngle < 90) {
                this.gateAngle = Math.min(90, this.gateAngle + 2.5 * simSpeed);
            } else {
                this.gateState = 'OPEN';
            }
        }
    }

    updateTrainScheduler(simSpeed) {
        if (this.gateState === 'CLOSED' || this.gateState === 'CLOSING') {
            this.autoTrainTimer += simSpeed;
            if (this.autoTrainTimer > 210 && this.trains.length === 0) {
                this.spawnManualTrain();
                this.autoTrainTimer = 0;
            }
        } else {
            this.autoTrainTimer = 0;
        }
    }

    emitExhaustParticles(agent, simSpeed) {
        if (agent.type === 'Pedestrian') return;
        
        const emitChance = agent.speed < 0.1 ? 0.04 : 0.14;
        
        if (Math.random() < emitChance * simSpeed) {
            const backDist = agent.width / 2;
            const px = agent.x - backDist * Math.cos(agent.angle);
            const py = agent.y - backDist * Math.sin(agent.angle);
            
            const vx = -agent.speed * 0.35 * Math.cos(agent.angle) + (Math.random() * 0.25 - 0.12);
            const vy = -agent.speed * 0.35 * Math.sin(agent.angle) + (Math.random() * 0.25 - 0.12);
            const size = 2.5 + Math.random() * 2.5;
            
            const grayVal = 185 + Math.floor(Math.random() * 35);
            const smokeColor = `rgb(${grayVal}, ${grayVal}, ${grayVal})`;
            
            this.particles.push(new Particle(px, py, vx, vy, size, smokeColor));
        }
    }

    update() {
        const simSpeed = this.simSpeed;

        this.spawnTraffic(simSpeed);
        this.updateGate(simSpeed);
        this.updateTrainScheduler(simSpeed);
        
        this.applyTrafficAI();

        for (let i = this.agents.length - 1; i >= 0; i--) {
            const agent = this.agents[i];
            agent.update(simSpeed, this.verticalLaneX, this.verticalLaneX);
            this.emitExhaustParticles(agent, simSpeed);

            if (agent.y < -50) {
                this.agents.splice(i, 1);
                this.passedCount++;
            }
            else if (agent.x < -100 || agent.x > 650) {
                this.agents.splice(i, 1);
            }
        }

        this.resolveCollisions();

        for (let i = this.trains.length - 1; i >= 0; i--) {
            const train = this.trains[i];
            train.update(simSpeed);

            if (train.isOffScreen()) {
                this.trains.splice(i, 1);
                if (this.countdownActive && this.gateCountdownSec <= 0) {
                    this.tryAutoOpenGate();
                }
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update();
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        if (this.flasherActive) {
            this.flasherTimer += simSpeed;
            const flasherRate = 22;
            const leftBulb = document.getElementById('flasher-left');
            const rightBulb = document.getElementById('flasher-right');

            if (Math.floor(this.flasherTimer / flasherRate) % 2 === 0) {
                leftBulb.classList.add('active-red');
                rightBulb.classList.remove('active-red');
            } else {
                leftBulb.classList.remove('active-red');
                rightBulb.classList.add('active-red');
            }
        }

        this.updateDashboardUI();
    }

    updateDashboardUI() {
        document.getElementById('stat-queue').innerText = this.currentQueueCount;
        document.getElementById('stat-passed').innerText = this.passedCount;
        document.getElementById('detail-train-count').innerText = this.trains.length;
        document.getElementById('detail-max-queue').innerText = this.maxQueueCount;

        const congestionRatio = Math.min(100, Math.round((this.currentQueueCount / 12) * 100));
        const valCongestion = document.getElementById('val-congestion');
        const barCongestion = document.getElementById('bar-congestion');

        valCongestion.innerText = congestionRatio + '%';
        barCongestion.style.width = congestionRatio + '%';

        if (congestionRatio > 70) {
            barCongestion.style.filter = 'drop-shadow(0 0 4px #f43f5e)';
        } else if (congestionRatio > 35) {
            barCongestion.style.filter = 'drop-shadow(0 0 3px #fbbf24)';
        } else {
            barCongestion.style.filter = 'none';
        }
    }

    // ========================================================================
    // 繪圖渲染系統
    // ========================================================================
    draw() {
        const ctx = this.ctx;
        
        ctx.fillStyle = '#181e18';
        ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

        // --- 行人紅磚道/人行道 (Sidewalks) ---
        ctx.fillStyle = '#1e222a';
        // 垂直人行道
        ctx.fillRect(this.roadLeft - 24, 0, 24, this.logicalHeight);
        ctx.fillRect(this.roadRight, 0, 24, this.logicalHeight);
        // 水平人行道
        ctx.fillRect(0, this.horizRoadTop - 20, this.logicalWidth, 20);
        ctx.fillRect(0, this.horizRoadBottom, this.logicalWidth, 20);

        // 繪製人行道地磚紋路 (Tile lines)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // 垂直人行道分割線
        for (let y = 0; y < this.logicalHeight; y += 20) {
            ctx.moveTo(this.roadLeft - 24, y);
            ctx.lineTo(this.roadLeft, y);
            ctx.moveTo(this.roadRight, y);
            ctx.lineTo(this.roadRight + 24, y);
        }
        // 水平人行道分割線
        for (let x = 0; x < this.logicalWidth; x += 20) {
            ctx.moveTo(x, this.horizRoadTop - 20);
            ctx.lineTo(x, this.horizRoadTop);
            ctx.moveTo(x, this.horizRoadBottom);
            ctx.lineTo(x, this.horizRoadBottom + 20);
        }
        ctx.stroke();

        ctx.fillStyle = '#262a33';
        
        ctx.fillRect(this.roadLeft, 0, this.laneWidth, this.logicalHeight);
        ctx.fillRect(0, this.horizRoadTop, this.logicalWidth, this.horizRoadWidth);
        ctx.fillRect(this.roadLeft, this.horizRoadTop, this.laneWidth, this.horizRoadWidth);

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 3.5;
        
        ctx.beginPath();
        ctx.moveTo(this.roadLeft, 0);
        ctx.lineTo(this.roadLeft, this.horizRoadTop);
        ctx.moveTo(this.roadRight, 0);
        ctx.lineTo(this.roadRight, this.horizRoadTop);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, this.horizRoadTop);
        ctx.lineTo(this.roadLeft, this.horizRoadTop);
        ctx.moveTo(0, this.horizRoadBottom);
        ctx.lineTo(this.roadLeft, this.horizRoadBottom);
        ctx.moveTo(this.roadRight, this.horizRoadTop);
        ctx.lineTo(this.logicalWidth, this.horizRoadTop);
        ctx.moveTo(this.roadRight, this.horizRoadBottom);
        ctx.lineTo(this.logicalWidth, this.horizRoadBottom);
        ctx.stroke();

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, this.horizontalRoadY - 1.5);
        ctx.lineTo(this.roadLeft, this.horizontalRoadY - 1.5);
        ctx.moveTo(0, this.horizontalRoadY + 1.5);
        ctx.lineTo(this.roadLeft, this.horizontalRoadY + 1.5);
        ctx.moveTo(this.roadRight, this.horizontalRoadY - 1.5);
        ctx.lineTo(this.logicalWidth, this.horizontalRoadY - 1.5);
        ctx.moveTo(this.roadRight, this.horizontalRoadY + 1.5);
        ctx.lineTo(this.logicalWidth, this.horizontalRoadY + 1.5);
        ctx.stroke();

        const zebraY = this.stopLineY + 22;
        const zebraW = 12;
        const zebraH = 7;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        for (let x = this.roadLeft + 6; x < this.roadRight - 4; x += 16) {
            ctx.fillRect(x, zebraY, zebraW, zebraH);
            ctx.fillRect(x, zebraY + 14, zebraW, zebraH);
        }

        const drawRailway = (trackY) => {
            ctx.fillStyle = '#374151';
            ctx.fillRect(0, trackY - 20, this.logicalWidth, 40);
            
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(0, trackY - 20, this.logicalWidth, 3);
            ctx.fillRect(0, trackY + 17, this.logicalWidth, 3);

            ctx.fillStyle = '#1e293b';
            const sleeperWidth = 5;
            const sleeperHeight = 30;
            const spacing = 16;
            for (let x = 0; x < this.logicalWidth; x += spacing) {
                ctx.fillRect(x, trackY - sleeperHeight/2, sleeperWidth, sleeperHeight);
            }

            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(0, trackY - 9, this.logicalWidth, 2.5);
            ctx.fillRect(0, trackY + 7, this.logicalWidth, 2.5);

            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(0, trackY - 8.5, this.logicalWidth, 1);
            ctx.fillRect(0, trackY + 7.5, this.logicalWidth, 1);
        };

        drawRailway(this.track1Y);
        drawRailway(this.track2Y);

        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
        ctx.lineWidth = 2.5;
        ctx.rect(this.roadLeft, this.track1Y - 22, this.laneWidth, 84);
        ctx.clip();
        ctx.beginPath();
        for (let val = -this.logicalWidth; val < this.logicalWidth * 2; val += 24) {
            ctx.moveTo(val, this.track1Y - 30);
            ctx.lineTo(val + 100, this.track2Y + 30);
        }
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.roadLeft + 4, this.stopLineY, this.laneWidth - 8, 4.5);
        
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '900 12px Noto Sans TC';
        ctx.fillText("停", this.verticalLaneX - 6, this.stopLineY + 14);
        ctx.restore();

        // 💡 支點基座繪製在底層 (車輛與行人下方)
        this.drawGateBases(ctx);

        for (let p of this.particles) {
            p.draw(ctx);
        }

        for (let agent of this.agents) {
            agent.draw(ctx);
        }

        for (let train of this.trains) {
            train.draw(ctx);
        }

        // 💡 柵欄手臂與警示燈繪製在頂層 (車輛與行人上方)
        this.drawGateArms(ctx);
    }

    drawGateBases(ctx) {
        const drawSingleBase = (pivotX, pivotY) => {
            ctx.save();
            ctx.translate(pivotX, pivotY);

            ctx.fillStyle = '#1e293b';
            ctx.fillRect(-10, -10, 20, 20);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.strokeRect(-10, -10, 20, 20);
            
            ctx.fillStyle = '#64748b';
            ctx.beginPath();
            ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        };

        drawSingleBase(this.roadLeft - 20, this.stopLineY - 8);
        drawSingleBase(this.roadRight + 20, this.stopLineY - 8);
    }

    drawGateArms(ctx) {
        const rad = (this.gateAngle * Math.PI) / 180;
        const armLength = this.laneWidth + 2; // 50 pixels, overlaps by 12 pixels in the center
        const armThickness = 4.5;

        const drawSingleArm = (pivotX, pivotY, direction) => {
            ctx.save();
            ctx.translate(pivotX, pivotY);
            ctx.rotate(direction === 1 ? -rad : rad - Math.PI);

            const segmentCount = 6;
            const segLen = armLength / segmentCount;
            for (let i = 0; i < segmentCount; i++) {
                ctx.fillStyle = i % 2 === 0 ? '#ef4444' : '#ffffff';
                ctx.fillRect(0, -armThickness/2, segLen, armThickness);
                ctx.translate(segLen, 0);
            }

            ctx.fillStyle = '#ff2a4b';
            ctx.shadowColor = '#ff2a4b';
            ctx.shadowBlur = this.gateState === 'CLOSED' ? 5 : 0;
            ctx.beginPath();
            ctx.arc(-4, 0, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        };

        drawSingleArm(this.roadLeft - 20, this.stopLineY - 8, 1);
        drawSingleArm(this.roadRight + 20, this.stopLineY - 8, -1);
    }

    // 【關鍵修復】重新定義 Simulation 類別的主循環方法，確保正常執行
    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

window.addEventListener('load', () => {
    const sim = new Simulation();
    sim.loop();
});
