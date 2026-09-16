package com.ielts.app.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Cookie 存储加密抽象（MOBILE-04B §7）。
 * 认证 cookie = SENSITIVE_AUTH_MATERIAL，必须 encrypted at rest。
 * 生产实现 [KeystoreCookieCipher] 使用 Android Keystore AES-256-GCM；
 * 测试实现 [InMemoryCookieCipher] 仅用于 JVM 单测，避免依赖 Robolectric Keystore 模拟。
 */
interface CookieCipher {
    /** 加密明文，返回 IV(12B) + 密文 */
    fun encrypt(plain: ByteArray): ByteArray

    /** 解密 [encrypt] 的输出；数据损坏/密钥异常时抛异常，由调用方降级为空会话 */
    fun decrypt(cipherBytes: ByteArray): ByteArray
}

/**
 * Android Keystore AES-256-GCM 实现。
 * 密钥：AndroidKeyStore alias "lingxi_cookie_key"，不可导出，按安装生成。
 */
class KeystoreCookieCipher(context: Context) : CookieCipher {

    // 惰性初始化：构造不触碰 AndroidKeyStore（Robolectric 测试环境安全），首次加解密时才取/建密钥
    private val keyStore: KeyStore by lazy {
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    }

    private fun key(): SecretKey {
        keyStore.getKey(ALIAS, null)?.let { return it as SecretKey }
        val generator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    override fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val cipherText = cipher.doFinal(plain)
        return cipher.iv + cipherText
    }

    override fun decrypt(cipherBytes: ByteArray): ByteArray {
        require(cipherBytes.size > IV_LENGTH) { "cipher bytes too short" }
        val iv = cipherBytes.copyOfRange(0, IV_LENGTH)
        val cipherText = cipherBytes.copyOfRange(IV_LENGTH, cipherBytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_LENGTH_BITS, iv))
        return cipher.doFinal(cipherText)
    }

    companion object {
        const val ALIAS = "lingxi_cookie_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_LENGTH = 12
        private const val TAG_LENGTH_BITS = 128
    }
}

/**
 * 测试用内存密钥 AES-GCM 实现（纯 JVM，可用于 Robolectric/本地单测）。
 * 仅用于验证 cookie 持久化逻辑，不作为生产加密路径。
 */
class InMemoryCookieCipher : CookieCipher {
    private val key: SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    override fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        return cipher.iv + cipher.doFinal(plain)
    }

    override fun decrypt(cipherBytes: ByteArray): ByteArray {
        val iv = cipherBytes.copyOfRange(0, 12)
        val cipherText = cipherBytes.copyOfRange(12, cipherBytes.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        return cipher.doFinal(cipherText)
    }
}
