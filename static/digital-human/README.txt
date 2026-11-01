# 照片数字人嘴型

坐标空间只有一种：avatar-base.png 的像素，宽 1024，高 1024。
底图和六张嘴型共用同一次 contain 缩放，不混用屏幕百分比。

config.json 的 mouth.centerX / centerY 是原图上的嘴唇位置。
每种嘴型的 contentX / contentY 是该 PNG 里实测的皮肤块中心。
绘制时让 content 点落到 center 上，再加上这张图自己的 offsetX / offsetY。

开发运行可以拖动、缩放、切换嘴型，并把 JSON 复制出来写回 config.json。
正式打包不显示校准层。
