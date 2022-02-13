#!/bin/bash

pid=`ps -ef --sort -time | grep -m 1 "node dist/app.js -p" | awk '{print $2}'`
kill $pid
