# Use an official Node.js image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# Copy package.json and package-lock.json first to leverage caching
COPY package*.json ./

# Copy the rest of the application code

RUN apt install -y python3 python3-pip libudev-dev

RUN npm install
# Build the application (if needed)
RUN npm run build

COPY . .
# Define the default command.
# You may need to adapt this depending on how the app is started.
# For example, if there is a start script:
CMD [ "npm", "run", "start" ]
