module.exports = {
    apps: [{
        name: 'hr-auto-checkin',
        script: './main.js',
        autorestart: true,
        watch: false,
        max_memory_restart: '100M',
        log_file: './hr.log',
        log_date_format: 'YYYY-MM-DD',
        merge_logs: true,
        exec_mode: 'fork',
        instances: 1,
        shutdown_with_message: false,
        log_rotate_size: '10M',
        log_rotate_interval: '0 0 * * 1',
        min_uptime: '10s',
        max_restarts: 5,
        restart_delay: 4000
    }]
};
