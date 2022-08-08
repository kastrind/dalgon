#!/bin/bash

pid=`ps -ef --sort -time | grep -m 1 "node dist/app.js -p" | awk '{print $2}'`
echo $pid
kill $pid

#un-schedule log archiver
crontab -l > temp_cron
sed -i -E '/dalgon_log_archiver/d' temp_cron
crontab temp_cron
rm temp_cron
