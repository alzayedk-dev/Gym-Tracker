// Lets train 💪 phone app: shows the live website (https://letstrain-iota.vercel.app) full screen.
// Everything (login, workouts, photos, coach, payments) runs on the website and Supabase,
// so the app gets every website update straight away without a new app release.
import { useCallback, useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation, WebViewOpenWindowEvent, WebViewHttpErrorEvent, IOSWebViewProps, AndroidWebViewProps } from 'react-native-webview/lib/WebViewTypes';
type WebViewProps = IOSWebViewProps & AndroidWebViewProps;

// The parts of the web view we control from the app.
type WebViewHandle = { goBack(): void; reload(): void; injectJavaScript(script: string): void };
// react-native-webview's published types leave out `ref` with this React version; it works at runtime.
const AppWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

const SITE = 'https://letstrain-iota.vercel.app';
const DEEP_BLUE = '#0a2463';

// Tells the website it's inside the app (payments open on the same screen, Google sign-in is hidden).
const FLAG_SCRIPT = 'window.LETS_TRAIN_APP = true; true;';

// Pages that should stay inside the app; anything else (e.g. a shared link) opens in the phone's browser.
const STAYS_IN_APP = [
  'letstrain-iota.vercel.app',
  'supabase.co',        // login confirmations and payment callback
  'myfatoorah.com',     // payment page
  'knet',               // KNET payment gateway pages
  'kpay.com.kw',
];
const staysInApp = (url: string) =>
  url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:') ||
  STAYS_IN_APP.some((host) => {
    try { return new URL(url).hostname.includes(host); } catch { return false; }
  });

export default function App() {
  const web = useRef<WebViewHandle>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Android back button goes back a page in the site instead of closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { web.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNav = useCallback((nav: WebViewNavigation) => setCanGoBack(nav.canGoBack), []);

  const onShouldStart = useCallback((req: { url: string; isTopFrame?: boolean }) => {
    if (req.isTopFrame === false || staysInApp(req.url)) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  const retry = () => { setFailed(false); setLoading(true); web.current?.reload(); };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <AppWebView
          ref={web}
          source={{ uri: SITE }}
          style={styles.web}
          applicationNameForUserAgent="LetsTrainApp/1.0"
          injectedJavaScriptBeforeContentLoaded={FLAG_SCRIPT}
          injectedJavaScript={FLAG_SCRIPT}
          onNavigationStateChange={onNav}
          onShouldStartLoadWithRequest={onShouldStart}
          // Links that try to open a new window (photos, MyFatoorah) load here instead.
          setSupportMultipleWindows={false}
          onOpenWindow={(e: WebViewOpenWindowEvent) => {
            const url = e.nativeEvent.targetUrl;
            if (staysInApp(url)) web.current?.injectJavaScript(`location.href = ${JSON.stringify(url)}; true;`);
            else Linking.openURL(url).catch(() => {});
          }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => setFailed(true)}
          onHttpError={(e: WebViewHttpErrorEvent) => { if (e.nativeEvent.statusCode >= 500) setFailed(true); }}
          domStorageEnabled
          javaScriptEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          allowsInlineMediaPlayback
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          contentInsetAdjustmentBehavior="never"
          bounces={Platform.OS === 'ios'}
        />

        {loading && !failed && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color={DEEP_BLUE} />
          </View>
        )}

        {failed && (
          <View style={[styles.overlay, styles.offline]}>
            <Text style={styles.title}>Lets train 💪</Text>
            <Text style={styles.message}>{"Can't reach Lets train right now. Check your internet connection."}</Text>
            <Pressable style={styles.button} onPress={retry} accessibilityRole="button">
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1, backgroundColor: '#ffffff' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)' },
  offline: { backgroundColor: '#ffffff', padding: 24, gap: 14 },
  title: { fontSize: 28, fontWeight: '800', color: DEEP_BLUE },
  message: { fontSize: 16, color: '#4a5b85', textAlign: 'center', lineHeight: 22 },
  button: { backgroundColor: DEEP_BLUE, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
