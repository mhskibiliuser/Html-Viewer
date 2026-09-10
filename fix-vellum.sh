#!/bin/sh
sed -i 's/50 \* 1024 \* 1024/150 * 1024 * 1024/g' index.html
sed -i 's/50MB max/150MB max/g' index.html
