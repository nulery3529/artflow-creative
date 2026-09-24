import UIKit
import WebKit

final class ArtFlowWebViewController: UIViewController {
    private var webView: WKWebView!
    private var iapBridge: ArtFlowIAPBridge?

    override func viewDidLoad() {
        super.viewDidLoad()

        let contentController = WKUserContentController()
        let nativeMarker = WKUserScript(
            source: """
            window.ArtFlowNative = { platform: "ios" };
            document.documentElement.dataset.artflowPlatform = "ios";
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        contentController.addUserScript(nativeMarker)

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        configuration.websiteDataStore = .default()\n        configuration.applicationNameForUserAgent = "ArtFlowCreativeNative/1.0"

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let productIDs = Bundle.main.object(forInfoDictionaryKey: "ARTFLOW_IAP_PRODUCT_IDS") as? [String] ?? []
        iapBridge = ArtFlowIAPBridge(webView: webView, productIDs: productIDs)
        contentController.add(iapBridge!, name: "artflowIAP")

        guard let url = URL(string: "https://artflowcreative.com") else { return }
        webView.load(URLRequest(url: url))
    }
}

extension ArtFlowWebViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        decisionHandler(.allow)
    }
}
