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
        contentController.add(self, name: "artflowNative")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        configuration.websiteDataStore = .default()
        configuration.applicationNameForUserAgent = "ArtFlowCreativeNative/1.0"

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self

        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(self, action: #selector(refreshWebView), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl

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

    @objc private func refreshWebView() {
        webView.reload()
    }

    private func shouldOpenExternally(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }

        if ["mailto", "tel", "sms"].contains(scheme) {
            return true
        }

        guard ["http", "https"].contains(scheme) else { return false }
        let host = (url.host ?? "").lowercased()

        return host != "artflowcreative.com"
            && host != "www.artflowcreative.com"
    }

    private func openExternal(_ url: URL) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
}

extension ArtFlowWebViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.navigationType == .linkActivated,
           let url = navigationAction.request.url,
           shouldOpenExternally(url) {
            openExternal(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        webView.scrollView.refreshControl?.endRefreshing()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        webView.scrollView.refreshControl?.endRefreshing()
    }
}


extension ArtFlowWebViewController: WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "artflowNative",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            return
        }

        switch action {
        case "shareFile":
            shareFile(body)
        default:
            break
        }
    }

    private func shareFile(_ body: [String: Any]) {
        guard let base64 = body["base64Data"] as? String,
              let data = Data(base64Encoded: base64),
              !data.isEmpty,
              data.count <= 20 * 1024 * 1024 else {
            return
        }

        let rawName = (body["filename"] as? String) ?? "artflow-export.txt"
        let safeName = rawName
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: "\\", with: "-")
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(safeName.isEmpty ? "artflow-export.txt" : safeName)

        do {
            try data.write(to: url, options: .atomic)
        } catch {
            return
        }

        let impact = UIImpactFeedbackGenerator(style: .light)
        impact.prepare()
        impact.impactOccurred()

        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = controller.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(
                x: view.bounds.midX,
                y: view.bounds.midY,
                width: 1,
                height: 1
            )
            popover.permittedArrowDirections = []
        }

        controller.completionWithItemsHandler = { _, _, _, _ in
            try? FileManager.default.removeItem(at: url)
        }

        present(controller, animated: true)
    }
}


extension ArtFlowWebViewController: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard navigationAction.targetFrame == nil,
              let url = navigationAction.request.url else {
            return nil
        }

        if shouldOpenExternally(url) {
            openExternal(url)
        } else {
            webView.load(navigationAction.request)
        }
        return nil
    }
}
