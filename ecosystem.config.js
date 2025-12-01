module.exports = {
    apps: [{
        name: 'hr-auto-checkin',
        script: './main.js',
        autorestart: true,
        watch: false,
        max_memory_restart: '10M',
        out_file: './hr-output.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        exec_mode: 'fork',
        instances: 1,
        shutdown_with_message: false
    }]
};
