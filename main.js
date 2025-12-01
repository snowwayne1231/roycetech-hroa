const fs = require('fs');
const path = require('path');

// --- Configuration & Constants ---
const CONFIG_PATH = path.join(__dirname, 'config.ini');

let config = {};
let global_info = {
    token: '',
    uuid: '',
    location: 'J',
    last_name: '',
    group: '',
    division: '',
    department: '',
};

// --- Logger Utility ---
const Logger = {
    info: (msg) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
    error: (msg, err) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`, err || ''),
    warn: (msg) => console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`)
};

// --- Helper Functions ---

function loadConfig() {
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const parsed = {};
        data.split(/\r?\n/).forEach(line => {
            line = line.trim();
            if (!line || line.startsWith(';') || line.startsWith('#')) return;
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                let key = match[1].trim();
                let value = match[2].trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                parsed[key] = value;
            }
        });
        config = parsed;
        // Logger.info('Configuration loaded successfully.'); // Reduce noise
        return true;
    } catch (error) {
        Logger.error('Failed to load configuration', error);
        return false;
    }
}

async function generalRequest(url, params, token = '', method = 'POST', retryCount = 3) {
    let attempt = 0;
    while (attempt < retryCount) {
        try {
            let headers = {
                'Content-Type': 'application/json',
                'referer': `${config.url_referer}/`,
                'origin': config.url_referer,
                'x-client-host': config.url_referer,
                'user-agent': config.agent
            };

            if (token && token.length > 2) {
                headers['x-access-token'] = token;
            }

            let fetchUrl = url;
            let fetchOption = {
                method,
                headers
            };

            if (method === 'GET') {
                const queryString = Object.keys(params)
                    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
                    .join('&');
                if (queryString) fetchUrl += `?${queryString}`;
            } else {
                fetchOption.body = JSON.stringify(params);
            }

            const response = await fetch(fetchUrl, fetchOption);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            attempt++;
            Logger.warn(`Request failed (Attempt ${attempt}/${retryCount}): ${url} - ${error.message}`);
            if (attempt >= retryCount) throw error;
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
}

// --- Business Logic ---

async function login() {
    Logger.info('Attempting to login...');
    const url_login = `${config.url_api}/manager/login`;
    const params = {
        id: config.id,
        password: config.password,
        displayLoading: true
    };

    try {
        const data = await generalRequest(url_login, params);
        if (data && data.myinfo) {
            global_info = data.myinfo;
            Logger.info(`Login successful. Welcome, ${global_info.last_name}`);
            return true;
        } else {
            Logger.error('Login failed: Invalid response format', data);
            return false;
        }
    } catch (error) {
        Logger.error('Login exception', error);
        return false;
    }
}

async function getAttendance() {
    Logger.info('Fetching attendance records...');
    const url_getattendance = `${config.url_api}/dashboard/attendance/state/load`;
    try {
        const data = await generalRequest(url_getattendance, { displayLoading: true }, global_info.token, 'GET', 1);
        return data?.sendpacket || {};
    } catch (error) {
        Logger.error('Failed to get attendance');
        return null;
    }
}

async function performCheckIn() {
    Logger.info('Performing Check-In...');
    const url_checkin = `${config.url_api}/dashboard/attendance/item/add`;
    const params = {
        type: 'start',
        location: {
            address: config.address,
            lat: config.address_lat,
            lng: config.address_lng
        },
        displayLoading: true
    };
    try {
        const result = await generalRequest(url_checkin, params, global_info.token);
        Logger.info(`Check-In Result: ${JSON.stringify(result)}`);
        return result;
    } catch (error) {
        Logger.error('Check-In failed', error);
    }
}

async function performCheckOut() {
    Logger.info('Performing Check-Out...');
    const url_checkout = `${config.url_api}/dashboard/attendance/item/add`;
    const params = {
        type: 'end',
        location: {
            address: config.address,
            lat: config.address_lat,
            lng: config.address_lng
        },
        displayLoading: true
    };
    try {
        const result = await generalRequest(url_checkout, params, global_info.token);
        Logger.info(`Check-Out Result: ${JSON.stringify(result)}`);
        return result;
    } catch (error) {
        Logger.error('Check-Out failed', error);
    }
}

function hasActionRecord(attendanceData, type) {
    if (!attendanceData) return false;
    const targetValue = attendanceData[type] || '';
    return targetValue && targetValue.length > 0;
}

// --- Scheduler Logic ---

let dailyTargets = {
    dateStr: '',
    checkInTime: null,
    checkOutTime: null,
    alreadyCheckedIn: false,
    alreadyCheckedOut: false
};

function parseTime(timeStr) {
    const [h, m, s] = timeStr.split(':').map(Number);
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s || 0);
    return date;
}

function getRandomDelay(minutes) {
    return Math.floor(Math.random() * minutes * 60 * 1000);
}

function isWorkDay() {
    const today = new Date().getDay(); // 0 = Sun, 6 = Sat
    const workDays = (config.workday_week || '').split(',').map(Number);
    return workDays.includes(today);
}

function getTodayTargets() {
    const now = new Date();
    const dateStr = now.toDateString();

    if (dailyTargets.dateStr !== dateStr) {
        // Regenerate targets for the new day
        const checkInBase = parseTime(config.checkin_time);
        const checkOutBase = parseTime(config.checkout_time);

        const checkInTarget = new Date(checkInBase.getTime() + getRandomDelay(parseInt(config.checkin_random_range_minutes || 0)));
        const checkOutTarget = new Date(checkOutBase.getTime() + getRandomDelay(parseInt(config.checkout_random_range_minutes || 0)));

        dailyTargets = {
            dateStr: dateStr,
            checkInTime: checkInTarget,
            checkOutTime: checkOutTarget,
            alreadyCheckedIn: false,
            alreadyCheckedOut: false
        };
        Logger.info(`Generated new targets for ${dateStr}: In @ ${checkInTarget.toLocaleTimeString()}, Out @ ${checkOutTarget.toLocaleTimeString()}`);
    }
    return dailyTargets;
}

async function executeTask(taskType) {
    // Try to login, catch error if fails
    let attendance = null;
    try {
        attendance = await getAttendance();
        if (attendance === null) {
            if (await login()) {
                attendance = await getAttendance() || {};
            }
        }
    } catch (e) {
        Logger.error('CRITICAL: Login failed during task execution', e);
        return; // Stop execution for this cycle
    }

    Logger.info(`Executing executeTask ${taskType}. attendance: ${JSON.stringify(attendance)}`);

    if (taskType === 'checkin') {
        if (hasActionRecord(attendance, 'starttime')) {
            Logger.info('Already checked in today. Skipping.');
            dailyTargets.alreadyCheckedIn = true;
        } else {
            await performCheckIn();
        }
    } else if (taskType === 'checkout') {
        if (hasActionRecord(attendance, 'endtime')) {
            Logger.info('Already checked out today. Skipping.');
            dailyTargets.alreadyCheckedOut = true;
        } else {
            await performCheckOut();
        }
    }
}

async function startHeartbeat() {
    let nextGap = 1;
    try {
        // Reload config every heartbeat to allow dynamic updates
        if (!loadConfig()) {
            Logger.error('Config load failed, retrying next heartbeat.');
            return;
        }

        if (!isWorkDay()) {
            nextGap = 60; // 1 hour
            Logger.info('Heartbeat: Today is not a workday. Relaxing.');
            return;
        }

        const targets = getTodayTargets();
        const now = new Date();

        // Check In Logic
        // If current time is past the target check-in time, ensure we are checked in.
        if (!targets.alreadyCheckedIn && now >= targets.checkInTime) {
            await executeTask('checkin');
        } else if (!targets.alreadyCheckedOut && now >= targets.checkOutTime) {
            await executeTask('checkout');
        } else if (targets.alreadyCheckedOut) {
            nextGap = 60;
            Logger.info('Already checked out today. Skipping.');
        } else {
            Logger.info(`Heartbeat: Next Targets -> In: ${targets.checkInTime.toLocaleTimeString()}, Out: ${targets.checkOutTime.toLocaleTimeString()}`);
        }

    } catch (err) {
        Logger.error('Unexpected error in heartbeat loop', err);
    } finally {
        const advoidSameSecond = Math.round(Math.random() * 3);
        setTimeout(startHeartbeat, (Math.round(nextGap * 60) + advoidSameSecond) * 1000);
    }
}

// --- Entry Point ---

Logger.info('Starting HR Attendance Automation Agent (Heartbeat Mode)...');
startHeartbeat();

// Handle graceful shutdown for PM2
process.on('SIGINT', () => {
    Logger.info('Stopping agent...');
    process.exit(0);
});