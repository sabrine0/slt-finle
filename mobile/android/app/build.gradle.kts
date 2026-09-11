import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Read the Google Maps API key from local.properties (gitignored) or env var.
val mapsApiKey: String = run {
    val props = Properties()
    val localProps = rootProject.file("local.properties")
    if (localProps.exists()) {
        FileInputStream(localProps).use { props.load(it) }
    }
    props.getProperty("MAPS_API_KEY")
        ?: System.getenv("MAPS_API_KEY")
        ?: "PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE"
}

android {
    namespace = "com.tomorrowsystems.swarm_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        applicationId = "com.tomorrowsystems.swarm_mobile"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        manifestPlaceholders["MAPS_API_KEY"] = mapsApiKey
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
