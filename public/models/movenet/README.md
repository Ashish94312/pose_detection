# MoveNet Model Files

This directory contains the MoveNet Lightning v4 model files:
- model.json: Model architecture and configuration
- group1-shard1of2.bin: Weight file 1 (4.0 MB)
- group1-shard2of2.bin: Weight file 2 (445 KB)

These files should be served statically by the web server.
The model.json references the weight files using relative paths.
