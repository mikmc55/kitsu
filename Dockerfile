FROM denoland/deno:2.1.4

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies using Deno
RUN deno install --allow-scripts

# Copy the rest of the application
COPY . .

# Set environment to production
ENV NODE_ENV=production

# Expose the port
EXPOSE 3003

# Run with Deno's Node compatibility mode
CMD ["deno", "run", "--allow-all", "--unstable-detect-cjs", "index.js"]
