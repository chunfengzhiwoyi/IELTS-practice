import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.ielts.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ielts.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // MOBILE-04B §9：Lingxi 后端 Base URL（BuildConfig 注入，禁止 hardcode 到 Composable）。
        // debug 默认指向本机 dev server（Android 模拟器 10.0.2.2）；生产构建必须通过
        // gradle property LINGXI_BACKEND_BASE_URL 覆盖为 HTTPS 域名。
        val lingxiBackendUrl = providers.gradleProperty("LINGXI_BACKEND_BASE_URL")
            .orElse("http://10.0.2.2:3000").get()
        buildConfigField("String", "LINGXI_BACKEND_BASE_URL", "\"$lingxiBackendUrl\"")
    }

    signingConfigs {
        create("release") {
            val keystorePropsFile = rootProject.file("keystore.properties")
            if (keystorePropsFile.exists()) {
                val props = Properties().apply { load(keystorePropsFile.inputStream()) }
                storeFile = rootProject.file(props.getProperty("storeFile")!!)
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    // MOBILE-04E（Final Product QA）：release 构建禁止默认指向本机/明文地址。
    // debug 默认 http://10.0.2.2:3000（本机 dev server，仅 debug 明文放行）；
    // release 必须在构建时显式提供 HTTPS 后端地址，否则直接构建失败。
    // 使用 taskGraph 判定：普通 assembleDebug / 测试不受影响。
    gradle.taskGraph.whenReady {
        val buildingRelease = allTasks.any {
            it.project == project && it.name.contains("Release", ignoreCase = true)
        }
        if (buildingRelease) {
            val u = providers.gradleProperty("LINGXI_BACKEND_BASE_URL").orNull
            if (u == null || !u.startsWith("https://")) {
                throw GradleException(
                    "MOBILE-04E: release build requires -PLINGXI_BACKEND_BASE_URL=https://... " +
                        "(got: ${u ?: "unset"})",
                )
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.10"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(project(":core"))

    implementation(platform("androidx.compose:compose-bom:2024.02.02"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.datastore:datastore-preferences:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")

    // MOBILE-04B §8：统一 Lingxi 后端 HTTP 栈（唯一 auth-aware stack）
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation("junit:junit:4.13.2")
    testImplementation("androidx.test:core:1.5.0")
    testImplementation("org.robolectric:robolectric:4.12.2")
    testImplementation("io.github.takahirom.roborazzi:roborazzi:1.20.0")
    testImplementation("androidx.compose.ui:ui-test-junit4:1.6.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
}
