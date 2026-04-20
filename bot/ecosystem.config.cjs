module.exports = {
  apps: [
    {
      name: "fakher-booking-bot",
      script: "dist/runner.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
        BOOKING_HEADLESS: "true",
        BOOKING_POLL_INTERVAL_MS: "15000",
      },
    },
  ],
};
