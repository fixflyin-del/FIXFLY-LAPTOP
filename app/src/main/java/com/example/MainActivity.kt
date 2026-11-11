package com.example

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.example.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      MyApplicationTheme {
        Surface(
          modifier = Modifier.fillMaxSize(),
          color = MaterialTheme.colorScheme.background
        ) {
          Box(modifier = Modifier.fillMaxSize().safeDrawingPadding()) {
            FixflyWebViewContainer()
          }
        }
      }
    }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun FixflyWebViewContainer(modifier: Modifier = Modifier) {
  var webViewInstance by remember { mutableStateOf<WebView?>(null) }
  var canGoBack by remember { mutableStateOf(false) }

  BackHandler(enabled = canGoBack) {
    webViewInstance?.let { wv ->
      if (wv.canGoBack()) {
        wv.goBack()
      }
    }
  }

  AndroidView(
    modifier = modifier.fillMaxSize(),
    factory = { context ->
      WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )

        settings.apply {
          javaScriptEnabled = true
          domStorageEnabled = true
          allowFileAccess = true
          databaseEnabled = true
          loadWithOverviewMode = true
          useWideViewPort = true
          cacheMode = WebSettings.LOAD_DEFAULT
          allowFileAccessFromFileURLs = true
          allowUniversalAccessFromFileURLs = true
          mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
          setGeolocationEnabled(true)
        }

        webChromeClient = object : WebChromeClient() {
          override fun onGeolocationPermissionsShowPrompt(
            origin: String?,
            callback: android.webkit.GeolocationPermissions.Callback?
          ) {
            callback?.invoke(origin, true, false)
          }
        }

        webViewClient = object : WebViewClient() {
          override fun shouldOverrideUrlLoading(
            view: WebView?,
            request: WebResourceRequest?
          ): Boolean {
            val url = request?.url?.toString() ?: return false

            // Route phone calls, WhatsApp, mailto, and external web links to Android system intents
            return when {
              url.startsWith("tel:") -> {
                try {
                  val intent = Intent(Intent.ACTION_DIAL, Uri.parse(url))
                  context.startActivity(intent)
                } catch (e: Exception) {
                  e.printStackTrace()
                }
                true
              }
              url.startsWith("mailto:") -> {
                try {
                  val intent = Intent(Intent.ACTION_SENDTO, Uri.parse(url))
                  context.startActivity(intent)
                } catch (e: Exception) {
                  e.printStackTrace()
                }
                true
              }
              url.startsWith("https://wa.me/") || url.startsWith("whatsapp:") -> {
                try {
                  val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                  context.startActivity(intent)
                } catch (e: Exception) {
                  e.printStackTrace()
                }
                true
              }
              url.startsWith("https://maps.app.goo.gl/") ||
              url.startsWith("https://www.google.com/maps") ||
              url.startsWith("https://www.amazon.in/") ||
              url.startsWith("https://www.facebook.com/") ||
              url.startsWith("https://www.instagram.com/") ||
              url.startsWith("https://x.com/") -> {
                try {
                  val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                  context.startActivity(intent)
                } catch (e: Exception) {
                  e.printStackTrace()
                }
                true
              }
              url.startsWith("https://fixfly.in") -> {
                false
              }
              url.startsWith("file:///android_asset/") -> {
                false
              }
              else -> false
            }
          }

          override fun onReceivedError(
            view: WebView?,
            errorCode: Int,
            description: String?,
            failingUrl: String?
          ) {
            super.onReceivedError(view, errorCode, description, failingUrl)
            // If live website is unavailable or user is offline, seamlessly fallback to local asset
            if (failingUrl?.startsWith("https://fixfly.in") == true) {
              view?.loadUrl("file:///android_asset/index.html")
            }
          }

          override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            canGoBack = view?.canGoBack() == true
          }
        }

        // Load live website so any changes in Admin Panel reflect in the Android App in real-time!
        loadUrl("https://fixfly.in")
        webViewInstance = this
      }
    },
    update = { wv ->
      canGoBack = wv.canGoBack()
    }
  )
}
