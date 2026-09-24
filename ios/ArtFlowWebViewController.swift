import UIKit
import WebKit

final class ArtFlowWebViewController: UIViewController {
    private var webView: WKWebView!
    private var iapBridge: ArtFlowIAPBridge?
    private let loadingIndicator = UIActivityIndicatorView(style: .large)
    private let errorView = UIView()
    private let errorTitleLabel = UILabel()
    private let errorMessageLabel = UILabel()
    private let retryButton = UIButton(type: .system)

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

        view.backgroundColor = UIColor(red: 0.078, green: 0.059, blue: 0.090, alpha: 1)
        view.addSubview(webView)
        configureNativeStateViews()

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
        loadingIndicator.startAnimating()
        webView.load(URLRequest(url: url))
    }

    private func configureNativeStateViews() {
        loadingIndicator.translatesAutoresizingMaskIntoConstraints = false
        loadingIndicator.color = .white
        loadingIndicator.hidesWhenStopped = true
        view.addSubview(loadingIndicator)

        errorView.translatesAutoresizingMaskIntoConstraints = false
        errorView.backgroundColor = UIColor(red: 0.078, green: 0.059, blue: 0.090, alpha: 1)
        errorView.isHidden = true

        errorTitleLabel.translatesAutoresizingMaskIntoConstraints = false
        errorTitleLabel.text = "Can’t connect to Art Flow"
        errorTitleLabel.textColor = .white
        errorTitleLabel.font = .systemFont(ofSize: 24, weight: .bold)
        errorTitleLabel.textAlignment = .center
        errorTitleLabel.numberOfLines = 0

        errorMessageLabel.translatesAutoresizingMaskIntoConstraints = false
        errorMessageLabel.text = "Check your internet connection and try again."
        errorMessageLabel.textColor = UIColor.white.withAlphaComponent(0.72)
        errorMessageLabel.font = .systemFont(ofSize: 16)
        errorMessageLabel.textAlignment = .center
        errorMessageLabel.numberOfLines = 0

        retryButton.translatesAutoresizingMaskIntoConstraints = false
        retryButton.setTitle("Try Again", for: .normal)
        retryButton.setTitleColor(.white, for: .normal)
        retryButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        retryButton.backgroundColor = UIColor(red: 0.35, green: 0.18, blue: 0.43, alpha: 1)
        retryButton.layer.cornerRadius = 16
        retryButton.contentEdgeInsets = UIEdgeInsets(top: 13, left: 26, bottom: 13, right: 26)
        retryButton.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)

        errorView.addSubview(errorTitleLabel)
        errorView.addSubview(errorMessageLabel)
        errorView.addSubview(retryButton)
        view.addSubview(errorView)

        NSLayoutConstraint.activate([
            loadingIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor),

            errorView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            errorView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            errorView.topAnchor.constraint(equalTo: view.topAnchor),
            errorView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            errorTitleLabel.leadingAnchor.constraint(greaterThanOrEqualTo: errorView.leadingAnchor, constant: 28),
            errorTitleLabel.trailingAnchor.constraint(lessThanOrEqualTo: errorView.trailingAnchor, constant: -28),
            errorTitleLabel.centerXAnchor.constraint(equalTo: errorView.centerXAnchor),
            errorTitleLabel.centerYAnchor.constraint(equalTo: errorView.centerYAnchor, constant: -54),

            errorMessageLabel.topAnchor.constraint(equalTo: errorTitleLabel.bottomAnchor, constant: 14),
            errorMessageLabel.leadingAnchor.constraint(equalTo: errorView.leadingAnchor, constant: 36),
            errorMessageLabel.trailingAnchor.constraint(equalTo: errorView.trailingAnchor, constant: -36),

            retryButton.topAnchor.constraint(equalTo: errorMessageLabel.bottomAnchor, constant: 24),
            retryButton.centerXAnchor.constraint(equalTo: errorView.centerXAnchor),
        ])
    }

    @objc private func refreshWebView() {
        errorView.isHidden = true
        webView.reload()
    }

    @objc private func retryLoad() {
        errorView.isHidden = true
        loadingIndicator.startAnimating()
        guard let url = URL(string: "https://artflowcreative.com") else { return }
        webView.load(URLRequest(url: url))
    }

    private func showLoadError(_ error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return
        }

        loadingIndicator.stopAnimating()
        errorView.isHidden = false
        view.bringSubviewToFront(errorView)
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

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        errorView.isHidden = true
        loadingIndicator.startAnimating()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        loadingIndicator.stopAnimating()
        errorView.isHidden = true
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        webView.scrollView.refreshControl?.endRefreshing()
        showLoadError(error)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        webView.scrollView.refreshControl?.endRefreshing()
        showLoadError(error)
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
