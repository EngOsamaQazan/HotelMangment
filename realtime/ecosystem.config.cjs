module.exports = {
  apps: [
    {
      name: "hotel-realtime",
      cwd: "/opt/hotel-app/realtime",
      script: "src/server.js",
      node_args: "--enable-source-maps",
      env: {
        NODE_ENV: "production",
        REALTIME_PORT: 3001,
        REALTIME_HOST: "127.0.0.1",
        // server.js uses REALTIME_ENV_FILE to locate the shared Next.js .env
        // (DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL).
        REALTIME_ENV_FILE: "/opt/hotel-app/.env",
      },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "500M",
      autorestart: true,
      watch: false,
      error_file: "/var/log/hotel-realtime.err.log",
      out_file: "/var/log/hotel-realtime.out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
