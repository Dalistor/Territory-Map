package com.territorymapapp

import android.content.Intent
import android.os.Build
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class ApkInstallerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ApkInstaller"

    @ReactMethod
    fun getAppVersion(promise: Promise) {
        try {
            val pInfo = reactContext.packageManager.getPackageInfo(reactContext.packageName, 0)
            val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode
            }
            val map = Arguments.createMap().apply {
                putInt("versionCode", versionCode)
                putString("versionName", pInfo.versionName)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("GET_VERSION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun downloadAndInstall(downloadUrl: String, appKey: String, promise: Promise) {
        Thread {
            var connection: HttpURLConnection? = null
            try {
                val url = URL(downloadUrl)
                connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive")
                if (appKey.isNotEmpty()) {
                    connection.setRequestProperty("X-App-Key", appKey)
                }
                connection.connectTimeout = 15000
                connection.readTimeout = 30000
                connection.connect()

                if (connection.responseCode !in 200..299) {
                    promise.reject("DOWNLOAD_ERROR", "Servidor retornou HTTP ${connection.responseCode}")
                    return@Thread
                }

                val fileLength = connection.contentLength
                val cacheDir = reactContext.externalCacheDir ?: reactContext.cacheDir
                val apkFile = File(cacheDir, "update.apk")
                if (apkFile.exists()) {
                    apkFile.delete()
                }

                connection.inputStream.use { input ->
                    FileOutputStream(apkFile).use { output ->
                        val data = ByteArray(8192)
                        var total: Long = 0
                        var count: Int
                        var lastReported = 0
                        while (input.read(data).also { count = it } != -1) {
                            total += count.toLong()
                            output.write(data, 0, count)
                            if (fileLength > 0) {
                                val progress = ((total * 100) / fileLength).toInt()
                                if (progress >= lastReported + 2 || progress == 100) {
                                    lastReported = progress
                                    sendProgressEvent(progress)
                                }
                            }
                        }
                    }
                }

                installApkFile(apkFile)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("INSTALL_ERROR", e.message, e)
            } finally {
                connection?.disconnect()
            }
        }.start()
    }

    private fun sendProgressEvent(progress: Int) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("onApkDownloadProgress", params)
    }

    private fun installApkFile(file: File) {
        val uri = FileProvider.getUriForFile(
            reactContext,
            "${reactContext.packageName}.fileprovider",
            file
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        reactContext.startActivity(intent)
    }
}
