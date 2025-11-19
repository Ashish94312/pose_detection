# Pose Detection Application

A real-time pose detection application built with React and MediaPipe. This application uses your webcam to detect and track human poses, calculate joint angles, and includes jump detection capabilities.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (version 14.0 or higher recommended)
- **npm** (comes with Node.js) or **yarn**
- A modern web browser with camera access support (Chrome, Firefox, Safari, or Edge)
- A webcam or camera device

## Setup Instructions

### 1. Clone the Repository

If you haven't already, clone or download this repository to your local machine.

```bash
cd pose_detection
```

### 2. Install Dependencies

Install all required npm packages:

```bash
npm install
```

This will install all dependencies listed in `package.json`, including:
- React 19.2.0
- MediaPipe Tasks Vision
- React Scripts
- Testing libraries

### 3. Start the Development Server

Run the application in development mode:

```bash
npm start
```

The application will automatically open in your browser at [http://localhost:3000](http://localhost:3000).

If it doesn't open automatically, manually navigate to `http://localhost:3000` in your browser.

### 4. Grant Camera Permissions

When you first load the application, your browser will prompt you to allow camera access. Click "Allow" to enable the pose detection features.

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

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will copy all configuration files and dependencies into your project so you have full control over them.

## Features

- **Real-time Pose Detection**: Uses MediaPipe to detect human poses from webcam input
- **Joint Angle Calculation**: Calculates and displays angles for various body joints
- **Jump Detection**: Includes jump detection capabilities with customizable widgets
- **Smooth Visualization**: Real-time pose visualization on canvas with smooth rendering

## Browser Requirements

This application requires:
- A modern browser with WebRTC support (Chrome, Firefox, Safari, or Edge)
- Camera/webcam access permissions
- HTTPS (or localhost) for camera access in most browsers

## Troubleshooting

### Camera Not Working

- Ensure you've granted camera permissions in your browser
- Check that no other application is using your camera
- Try refreshing the page and granting permissions again
- On some browsers, camera access requires HTTPS (localhost is exempt)

### Port Already in Use

If port 3000 is already in use, React will prompt you to use a different port. You can also manually specify a port:

```bash
PORT=3001 npm start
```

### Installation Issues

If you encounter issues during `npm install`:

1. Delete `node_modules` folder and `package-lock.json`
2. Clear npm cache: `npm cache clean --force`
3. Reinstall: `npm install`

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
