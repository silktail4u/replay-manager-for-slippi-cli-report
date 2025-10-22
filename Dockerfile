# Use an official Node.js image
FROM node:latest-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# Copy package.json and package-lock.json first to leverage caching
COPY package*.json ./

RUN npm install --production

# Copy the rest of the application code
COPY . .

# Build the application (if needed)
RUN npm run build

# Define the default command.
# You may need to adapt this depending on how the app is started.
# For example, if there is a start script:
CMD [ "npm", "run", "start" ]
