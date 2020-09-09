/*
    Frida Xposed Bridge
    by Monkeylord
    License: MIT
    
    Load Xposed Bridge&Modules though Frida.
    
    原理：通过Frida加载XposedBridge.jar，同时通过Frida Java Hook来实现Xposed API。随后模拟Xposed初始化，并加载插件，然后再模拟应用启动。
*/

var typeTranslation = {
    "Z":"java.lang.Boolean",
    "B":"java.lang.Byte",
    "S":"java.lang.Short",
    "I":"java.lang.Integer",
    "J":"java.lang.Long",
    "F":"java.lang.Float",
    "D":"java.lang.Double"
}

var XposedClassFactory = null

function implementXposedAPI(){
    // Implement ZygoteService API
    var ZygoteService = XposedClassFactory.use("de.robv.android.xposed.services.ZygoteService")
    
    ZygoteService.checkFileAccess.implementation = function(){
        console.log("[API Call] checkFileAccess", " filename:", arguments[0])
        return true
    }
    
    ZygoteService.statFile.implementation = function(){
        console.log("[API Call] statFile", " filename:", arguments[0])
        return null
    }
    
    ZygoteService.readFile.overload('java.lang.String').implementation = function(){
        console.log("[API Call] readFile", " filename:", arguments[0])
        return null
    }
    
    // Implement XposedBridge API
    var XposedBridge =  XposedClassFactory.use("de.robv.android.xposed.XposedBridge")
    XposedBridge.runtime.value = 2  // Art
    XposedBridge.hadInitErrors.implementation=function(){
        console.log("[API Call] hadInitErrors")
        return false
    }
    
    XposedBridge.getStartClassName.implementation=function(){
        console.log("[API Call] getStartClassName")
        // TODO
        return ""
    }
    
    XposedBridge.getRuntime.implementation=function(){
        console.log("[API Call] getRuntime")
        // 1 = Dalvik, 2 = Art
        return 2
    }
    
    XposedBridge.startsSystemServer.implementation=function(){
        console.log("[API Call] startsSystemServer")
        // TODO
        return false
    }
    
    XposedBridge.getXposedVersion.implementation=function(){
        console.log("[API Call] getXposedVersion")
        return 82
    }
    
    XposedBridge.initXResourcesNative.implementation=function(){
        console.log("[API Call] initXResourcesNative")
        // Disable Resource Hook
        // TODO: implement Resource Hook
        return false
    }
    
    XposedBridge.hookMethodNative.implementation=function(javaReflectedMethod, jobject, jint, javaAdditionalInfo){
        console.log("[API Call] hookMethodNative", javaReflectedMethod.getDeclaringClass().getName(), javaReflectedMethod.getName())
        
        // 这里来的，可能是Method，也可能是Constructor
        // 在7.0里不能直接getClass，用$className替代
        var refMethod = Java.use(javaReflectedMethod.$className)
        var method = Java.cast(javaReflectedMethod, refMethod)
               
        // 创建GlobalRef，不然再次调用时可能就是野指针了
        javaReflectedMethod.$h = Java.vm.getEnv().newGlobalRef(javaReflectedMethod.$h)
        javaAdditionalInfo.$h = Java.vm.getEnv().newGlobalRef(javaAdditionalInfo.$h)
        
        
        // 拿基本信息
        
        // Frida中Method Hook和Constructor Hook方式不同，所以要区分
        var clazz = method.getDeclaringClass().getName()
        var mtdname = (javaReflectedMethod.$className=="java.lang.reflect.Constructor")? "$init": method.getName()
        var overload = method.getParameterTypes().map(function(clz){return clz.getName()})
        
        var fridaMethod = Java.use(clazz)[mtdname].overload.apply(Java.use(clazz)[mtdname], overload)
        
        fridaMethod.implementation = function(){
            console.log("handleHookedMethod", javaReflectedMethod.getDeclaringClass().getName(), javaReflectedMethod.getName())
            var isInstanceMethod = fridaMethod.type == 3    // 3 = Instance Method
            var thisObject = null
            if (isInstanceMethod)
                thisObject = this
            
            var args = arguments
            var jarr = Object.keys(arguments).map(function(key){return args[key]})
            
            fridaMethod.argumentTypes.forEach(function(type,index){
                if(type.type != "pointer")jarr[index] = Java.use(typeTranslation[type.name]).valueOf(jarr[index])
                else{
                    var env = Java.vm.getEnv()
                    jarr[index] = Java.classFactory._getType("java.lang.Object").fromJni(type.toJni(jarr[index], env),env, false)
                }
            })
            
            try{
                var xposedResult = XposedBridge.handleHookedMethod(javaReflectedMethod, jint, javaAdditionalInfo, thisObject, Java.array("java.lang.Object", jarr))
                /*
                    Frida-java在这里有Bug，手动解决数组对象问题
                */
                var env = Java.vm.getEnv()
                var retType = fridaMethod._p[4]
                var hhmRetType = XposedBridge.handleHookedMethod.overloads[0]._p[4]
                
                if(xposedResult==null)return null
                if(retType.type != "pointer"){
                    var value
                    var basicObj = Java.cast(xposedResult,Java.use(typeTranslation[retType.name]))
                    switch(retType.name){
                        case "Z":
                            value = basicObj.booleanValue();break;
                        case "B":
                            value = basicObj.byteValue();break;
                        case "S":
                            value = basicObj.shortValue();break;
                        case "I":
                            value = basicObj.intValue();break;
                        case "J":
                            value = basicObj.longValue();break;
                        case "F":
                            value = basicObj.floatValue();break;
                        case "D":
                            value = basicObj.doubleValue();break;
                    }
                    return value
                }else{
                    return retType.fromJni(hhmRetType.toJni(xposedResult, env), env, false)
                }
            }catch(e){
                console.log("Exception: ", e)
                throw e
            }
        }
    }
    
    XposedBridge.setObjectClassNative.implementation=function(javaObj, javaClazz){
        console.log("[API Call] setObjectClassNative", javaObj, javaClazz)
        Java.cast(javaObj, javaClazz)
    }
    
    XposedBridge.dumpObjectNative.implementation=function(){
        console.log("[API Call] dumpObjectNative")
        return undefined
    }
    
    XposedBridge.cloneToSubclassNative.implementation=function(javaObj, javaClazz){
        console.log("[API Call] cloneToSubclassNative", javaObj, javaClazz)
        return Java.cast(javaObj, javaClazz)
    }
    
    XposedBridge.removeFinalFlagNative.implementation=function(){
        console.log("[API Call] removeFinalFlagNative")
        // TODO: Remove final flag
        // This is used by Resource Hook
        // Reference: https://github.com/frida/frida-java-bridge/blob/master/lib/android.js#L1390
    }
    
    XposedBridge.invokeOriginalMethodNative.implementation = function(javaMethod, isResolved, jobjectArray, jclass, javaReceiver, javaArgs){
        console.log("[API Call] invokeOriginalMethodNative", javaMethod)
        
        var refMethod = Java.use(javaMethod.$className)
        var method = Java.cast(javaMethod, refMethod)
        var clazz = method.getDeclaringClass().getName()
        var mtdname = method.getName()
        var overload = method.getParameterTypes().map(function(clz){return clz.getName()})
        
        var fridaMethod = Java.use(clazz)[mtdname].overload.apply(Java.use(clazz)[mtdname], overload)
        var thisObject = (fridaMethod.type == 3)?Java.cast(javaReceiver, Java.use(clazz)):Java.use(clazz)
        
        var jarr = javaArgs
        // 不知道为什么结尾可能会多一个null，可能是ducktape问题？手动去掉。
        jarr = jarr.slice(0, javaArgs.length)
        
        fridaMethod.argumentTypes.forEach(function(type,index){
            if(type.type!="pointer"){
                //console.log("CAST: ",JSON.stringify(Object.keys(jarr[index])))
                var value
                var basicObj = Java.cast(jarr[index],Java.use(typeTranslation[type.name]))
                switch(type.name){
                    case "Z":
                        value = basicObj.booleanValue();break;
                    case "B":
                        value = basicObj.byteValue();break;
                    case "S":
                        value = basicObj.shortValue();break;
                    case "I":
                        value = basicObj.intValue();break;
                    case "J":
                        value = basicObj.longValue();break;
                    case "F":
                        value = basicObj.floatValue();break;
                    case "D":
                        value = basicObj.doubleValue();break;
                }
                jarr[index]=value
            }else{
                var env = Java.vm.getEnv()
                jarr[index] = type.fromJni(Java.classFactory._getType("java.lang.Object").toJni(jarr[index], env), env, false)
            }

        })
        
        var result = null
        try{
            result = fridaMethod.apply(thisObject, jarr)
            /*
                这里有Frida的Bug，frida-java-bridge的对象处理中，数组并不被认为是Object，所以不能作为Object返回。
                因为数组经过了转换，转换的代码在 https://github.com/frida/frida-java-bridge/blob/4aa88501d2c6c871ada1c696816ca6f7f2626d7b/lib/types.js#L396
                而数组处理需要ArrayType来处理，ObjectType并不兼容它
                
                需要手动解决这个问题，构造和析构对象。
            */
            var env = Java.vm.getEnv()
            var retType = fridaMethod._p[4]
            var iomnRetType = XposedBridge.invokeOriginalMethodNative.overloads[0]._p[4]
            
            if(retType.type != "pointer")return Java.use(typeTranslation[retType.name]).valueOf(result)
                
            var rawResult = retType.toJni(result, env)
            var tmpResult = iomnRetType.fromJni(rawResult, env, false)
            result = tmpResult
            
        }catch(e){
            console.log(e)
            throw e
        }
        return result || null
    }
    
    XposedBridge.closeFilesBeforeForkNative.implementation=function(){
        console.log("[API Call] closeFilesBeforeForkNative")
        // TODO
        // Useless outside Zygote
    }
    
    XposedBridge.reopenFilesAfterForkNative.implementation=function(){
        console.log("[API Call] reopenFilesAfterForkNative")
        // TODO
        // Useless outside Zygote
    }
    
    XposedBridge.invalidateCallersNative.implementation=function(){
        console.log("[API Call] invalidateCallersNative")
        // TODO: 
        // This is used in resource hook
    }
}

function FrameworkInit(bridgePath, xposedPath){
    var ActivityThread = Java.use("android.app.ActivityThread")
    var apkClassloader = ActivityThread.currentActivityThread().peekPackageInfo(ActivityThread.currentApplication().getPackageName(), true).getClassLoader()

    console.log("[XposedFridaBridge] Current Application Classloader: ",apkClassloader)
    
    // 加载Xposed类
    // Java.openClassFile(bridgePath).load()
    var app = ActivityThread.currentApplication()
    var DexClassLoader = Java.use("dalvik.system.DexClassLoader")
    var codeCacheDir = (app.getCodeCacheDir) ? app.getCodeCacheDir().toString() : "/data/data/" + app.getPackageName() + "/code_cache"
    console.log("[XposedFridaBridge] Code Cache Directory: ", codeCacheDir)
    var XposedCL = DexClassLoader.$new(bridgePath, codeCacheDir, null, DexClassLoader.getSystemClassLoader());
    XposedClassFactory = Java.ClassFactory.get(XposedCL)
    console.log("[XposedFridaBridge] Xposed Classloader: ", XposedCL)

    // 实现XposedBridge API
    implementXposedAPI()
    
    console.log("[XposedFridaBridge] XposedBridge successfully loaded\n")
    
    // 开始处理初始化
    console.log("[XposedFridaBridge] Initating Xposed Framework")

    // 模拟XposedBridge.main
    var XposedBridge =  XposedClassFactory.use("de.robv.android.xposed.XposedBridge")
    // XposedBridge.initXResources()    //initXResource被放弃实现，转而通过对XposedBridge.jar二次打包实现，修改了android.content.res.XResource
    XposedBridge.XPOSED_BRIDGE_VERSION.value = 82
    XposedBridge.BOOTCLASSLOADER.value = XposedCL
    XposedBridge.isZygote.value = true
    
    var XposedInit = XposedClassFactory.use("de.robv.android.xposed.XposedInit")
    XposedInit.BASE_DIR.value = xposedPath
    console.log("[XposedFridaBridge] Static Attribute Set")
    
    console.log("[XposedFridaBridge] Initating SELinuxHelper")
    var SELinuxHelper = XposedClassFactory.use("de.robv.android.xposed.SELinuxHelper")
    SELinuxHelper.initOnce()
    SELinuxHelper.initForProcess(ActivityThread.currentApplication().getPackageName())

    console.log("[XposedFridaBridge] hookResources")
    XposedInit.hookResources()
    console.log("[XposedFridaBridge] initForZygote")
    XposedInit.initForZygote()
    console.log("[XposedFridaBridge] Framework Initated\n")
    
    console.log("[XposedFridaBridge] Load Modules")
    XposedInit.loadModules()
    
    console.log("[XposedFridaBridge] Xposed Framework Ready\n")
}

function triggerLoadPackage(){
    
    var XposedBridge =  XposedClassFactory.use("de.robv.android.xposed.XposedBridge")
    var XCallback = XposedClassFactory.use("de.robv.android.xposed.callbacks.XCallback")
    var LoadPackageParam = XposedClassFactory.use("de.robv.android.xposed.callbacks.XC_LoadPackage$LoadPackageParam")
    
    console.log("[XposedFridaBridge] Preparing LoadPackageParam")
    var ActivityThread = Java.use("android.app.ActivityThread")
    var app = ActivityThread.currentApplication()
    var thread = ActivityThread.currentActivityThread()
    console.log(" [PackageName]", app.getPackageName())
    console.log(" [ProcessName]", ActivityThread.currentPackageName())
    var boundApplication = thread.mBoundApplication.value
    console.log(" [boundApplication]", boundApplication)
    var appInfo = boundApplication.appInfo.value
    console.log(" [AppInfo]", appInfo)
    //console.log(appInfo.packageName.value)
    var compatInfo = boundApplication.compatInfo.value
    console.log(" [compatInfo]", compatInfo)
    var loadedApk = thread.getPackageInfoNoCheck(appInfo, compatInfo)
    console.log(" [loadedApk]", loadedApk)
    var classLoader = loadedApk.getClassLoader()
    console.log(" [classLoader]", classLoader)
    
    var lpparam = LoadPackageParam.$new(XposedBridge.sLoadedPackageCallbacks.value)
    lpparam.packageName.value = app.getPackageName()
    lpparam.processName.value = ActivityThread.currentPackageName()
    lpparam.classLoader.value = loadedApk.getClassLoader()
    lpparam.appInfo.value = loadedApk.getApplicationInfo()
    lpparam.isFirstApplication.value = true
    
    console.log("[XposedFridaBridge] LoadPackageParam Ready\n")
    console.log("[XposedFridaBridge] Triggering Modules")
    XCallback.callAll(lpparam)
}

// 启动
function startBridge(){
    Java.performNow(function(){
        // Java.deoptimizeEverything()
        console.log("Xposed Frida Bridge\n by Monkeylord\n")
        
        console.log("XposedBridge.jar Path:", "/data/local/tmp/XposedBridge.jar")
        console.log("modules.list Path:", "/data/local/tmp/conf/modules.list")
        console.log("\n")
        
        console.log("[XposedFridaBridge] Start Loading Xposed")
        
        // 获取当前应用Application
        var ActivityThread = Java.use("android.app.ActivityThread")
        var app = ActivityThread.currentApplication()
        
        if(app!=null){
            // 当前应用已加载，直接加载
            // 初始化Framework
            console.log("[XposedFridaBridge] Current Application: ", app.getPackageName())
            FrameworkInit("/data/local/tmp/XposedBridge.jar", "/data/local/tmp/")
                
            // 触发模块启动
            console.log("[XposedFridaBridge] Triggering Modules Load")
            triggerLoadPackage()
            
            console.log("[XposedFridaBridge] Ready\n")
        }else{
            // Spawn方式启动，等待应用加载
            console.log("[XposedFridaBridge] Application has not initialized, waiting.")
            ActivityThread.handleBindApplication.implementation = function(appInfo){
                // 注意：此处和Xposed加载顺序不同，Xposed在handleBindApplication前初始化模块
                // 但由于目前实现需要其中的currentApplication，便利起见，在之后初始化模块
                // TODO 使用其他方式替代currentApplication
                this.handleBindApplication()
                // 特定位置初始化Framework
                app = ActivityThread.currentApplication()
                console.log("[XposedFridaBridge] Current Application: ", app.getPackageName())
                FrameworkInit("/data/local/tmp/XposedBridge.jar", "/data/local/tmp/")
                    
                // 触发模块启动
                console.log("[XposedFridaBridge] Triggering Modules Load")
                triggerLoadPackage()
                
                console.log("[XposedFridaBridge] Ready\n")
            }
        }
        

    })
}

setTimeout(startBridge, 10)