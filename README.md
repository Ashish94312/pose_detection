# Pose Detection Application

A real-time pose detection application built with React and MediaPipe. This application uses your webcam to detect and track human poses, calculate joint angles, and includes jump detection capabilities.

## Quick Start

```bash
# 1. Navigate to project directory
cd pose_detection

# 2. Install dependencies
npm install

# 3. Start the application
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser and allow camera access when prompted.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (version 14.0 or higher, LTS version recommended)
- **npm** (comes with Node.js)
- A modern web browser with camera access (Chrome, Firefox, Safari, or Edge)
- A webcam or camera device

### Installing Node.js

Download and install Node.js from [nodejs.org](https://nodejs.org/) (choose LTS version). Verify installation:
```bash
node --version
npm --version
```

## Setup Instructions

### 1. Get the Project

Clone or download the repository and navigate to the project directory:
```bash
cd pose_detection
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Application

```bash
npm start
```

The application will open at [http://localhost:3000](http://localhost:3000). Grant camera permissions when prompted.

### 4. Access from Other Devices (Optional)

To access from other devices on the same network:

1. Find your computer's IP address:
   - **Windows:** `ipconfig` (look for IPv4 Address)
   - **macOS/Linux:** `ifconfig` or `ip addr show`

2. Start server with network access:
   ```bash
   # Windows (Command Prompt)
   set HOST=0.0.0.0 && npm start
   
   # Windows (PowerShell)
   $env:HOST="0.0.0.0"; npm start
   
   # macOS/Linux
   HOST=0.0.0.0 npm start
   ```

3. Access from other devices: `http://YOUR_IP_ADDRESS:3000`

## Available Scripts

### `npm start`

Runs the app in development mode. The page will reload automatically when you make changes. You may also see lint errors in the console.

**Note:** The app runs on `http://localhost:3000` by default. If port 3000 is in use, React will prompt you to use a different port.

### `npm test`

Launches the test runner in interactive watch mode. See the [running tests documentation](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder. It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include hashes. Your app is ready to be deployed!

See the [deployment documentation](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: This is a one-way operation. Once you `eject`, you can't go back!**

Ejects from Create React App, giving you full control over the configuration.

## Features

- **Real-time Pose Detection**: Uses MediaPipe to detect human poses from webcam input
- **Joint Angle Calculation**: Calculates and displays angles for various body joints
- **Segment Orientation**: Calculates biomechanically meaningful segment orientations
- **Jump Detection**: Includes jump detection capabilities with customizable widgets
- **Smooth Visualization**: Real-time pose visualization on canvas with smooth rendering


## Requirements

- **Node.js:** Version 14.0 or higher (LTS recommended)
- **RAM:** 4GB minimum, 8GB recommended
- **Browser:** Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+
- **Camera:** Webcam or camera device with browser permissions

## Troubleshooting

### Camera Not Working
- Grant camera permissions in your browser settings
- Close other applications using the camera
- Try refreshing the page
- Check browser site settings for camera permissions

### Port Already in Use
```bash
# Windows (Command Prompt)
set PORT=3001 && npm start

# Windows (PowerShell)
$env:PORT=3001; npm start

# macOS/Linux
PORT=3001 npm start
```

### Installation Issues
```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Node.js Version Issues
Update Node.js to version 14.0 or higher from [nodejs.org](https://nodejs.org/)

## Project Structure

```
pose_detection/
├── public/              # Static files
├── src/
│   ├── components/     # React components
│   ├── config/         # Configuration files
│   ├── hooks/          # Custom React hooks
│   ├── jumpDetection/  # Jump detection module
│   ├── utils/          # Utility functions
│   └── App.js          # Main application component
├── package.json        # Dependencies and scripts
└── README.md          # This file
```

## Learn More

- [Create React App Documentation](https://facebook.github.io/create-react-app/docs/getting-started)
- [React Documentation](https://reactjs.org/)
- [MediaPipe Documentation](https://developers.google.com/mediapipe)
