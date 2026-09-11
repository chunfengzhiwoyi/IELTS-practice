package com.ielts.app

import android.app.Application
import com.ielts.app.data.DataStoreStorageAdapter
import com.ielts.app.data.dataStore
import com.ielts.core.storage.Store

class IeltsApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val adapter = DataStoreStorageAdapter(dataStore)
        adapter.ensureLoaded()
        Store.adapter = adapter
    }
}
