module.exports = {
  apps: [
    {
      name: "flowpilot-backend",
      cwd: "./backend",
      // Uses backend virtualenv python and loads backend/.env.
      script: "../.venv/bin/uvicorn",
      args: "main:app --host 127.0.0.1 --port 8011",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "flowpilot-frontend",
      cwd: ".",
      script: "npm",
      args: "run start -- -p 3000",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
