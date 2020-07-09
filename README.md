# XposedFridaBridge
## 介绍 Introduction

A frida script implement XposedBridge &amp; load xposed modules, without installing xposed framwork.

在不安装Xposed Framework的情况下，通过Frida使用Xposed插件。

## 用法 Usage

### 准备工作 Preparation

1. 将XposedBridge.jar推入设备中 push XposedBridge.jar into device
2. 安装插件或将插件APK推入设备中 install modules or push module apks into device
3. 配置插件列表 configure modules.list

~~~shell
adb push XposedBridge.jar /data/local/tmp/XposedBridge.jar
adb install module.apk
adb shell 'echo "/data/app/demo.xposedmodule-1/base.apk" > /data/local/tmp/conf/modules.list' 
~~~

`/data/local/tmp/conf/modules.list`与XposedInstaller沙箱下的`/conf/modules.list`相同，其格式是每行一个APK路径，插件APK可安装，也可不安装。路径指向/data/local/tmp中的APK也可以。

### 开始使用 Load Modules

~~~shell
frida -U [target app process] -l XposedFridaBridge.js
~~~

## 已知问题 Known Issues

在Nexus5设备上测试通过，可以使用justtrustme等插件，但是部分模拟器可能会有兼容性问题，比如夜神，`com.android.org.conscrypt.TrustManagerImpl`中的`checkServerTrusted`不能被Frida Hook，Hook之后会崩溃。