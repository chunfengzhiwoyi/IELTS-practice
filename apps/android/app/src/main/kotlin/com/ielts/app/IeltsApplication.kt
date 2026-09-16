package com.ielts.app

import android.app.Application
import com.ielts.app.auth.EncryptedCookieJar
import com.ielts.app.auth.KeystoreCookieCipher
import com.ielts.app.auth.LingxiApiClient
import com.ielts.app.data.DataStoreStorageAdapter
import com.ielts.app.data.dataStore
import com.ielts.core.storage.Store

class IeltsApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val adapter = DataStoreStorageAdapter(dataStore)
        adapter.ensureLoaded()
        Store.adapter = adapter

        // MOBILE-04B §7：认证 cookie = SENSITIVE_AUTH_MATERIAL，必须加密持久化。
        // Keystore 密钥惰性初始化，构造过程不触碰 AndroidKeyStore。
        LingxiApiClient.cookieJar = EncryptedCookieJar(this, KeystoreCookieCipher(this))
    }
}
