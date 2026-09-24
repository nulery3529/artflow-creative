import Foundation
import StoreKit
import WebKit

@MainActor
final class ArtFlowIAPBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private let productIDs: Set<String>
    private var products: [String: Product] = [:]
    private var updatesTask: Task<Void, Never>?

    init(webView: WKWebView, productIDs: [String]) {
        self.webView = webView
        self.productIDs = Set(productIDs)
        super.init()

        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    await self.sendEntitlement()
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "artflowIAP",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            return
        }

        Task {
            switch action {
            case "getProducts":
                await sendProducts()
            case "getSubscriptionState":
                await sendProducts()
                await sendEntitlement()
            case "purchase":
                guard let productID = body["productId"] as? String else {
                    await send(type: "error", extra: ["message": "Missing Apple product ID."])
                    return
                }
                await purchase(productID: productID)
            case "restorePurchases":
                await restorePurchases()
            default:
                await send(type: "error", extra: ["message": "Unknown purchase request."])
            }
        }
    }

    private func loadProducts() async throws -> [Product] {
        let loaded = try await Product.products(for: productIDs)
        products = Dictionary(uniqueKeysWithValues: loaded.map { ($0.id, $0) })
        return loaded
    }

    private func sendProducts() async {
        do {
            let loaded = try await loadProducts()
            let payload = loaded.map { product in
                [
                    "id": product.id,
                    "displayName": product.displayName,
                    "displayPrice": product.displayPrice,
                    "period": periodString(product.subscription?.subscriptionPeriod)
                ]
            }
            await send(type: "products", extra: ["products": payload])
        } catch {
            await send(type: "error", extra: ["message": "Could not load App Store subscription options."])
        }
    }

    private func purchase(productID: String) async {
        await send(type: "purchase-started")

        do {
            let product: Product
            if let cached = products[productID] {
                product = cached
            } else {
                let loaded = try await Product.products(for: [productID])
                guard let first = loaded.first else {
                    await send(type: "error", extra: ["message": "This subscription is not available."])
                    return
                }
                product = first
                products[productID] = first
            }

            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    await send(type: "error", extra: ["message": "Apple could not verify this purchase."])
                    return
                }
                await transaction.finish()
                let active = await hasActiveEntitlement()
                await send(type: "purchase-complete", extra: ["entitled": active])

            case .userCancelled:
                await send(type: "purchase-cancelled")

            case .pending:
                await send(type: "error", extra: ["message": "This purchase is pending Apple approval."])

            @unknown default:
                await send(type: "error", extra: ["message": "Apple returned an unknown purchase status."])
            }
        } catch {
            await send(type: "error", extra: ["message": "The purchase could not be completed."])
        }
    }

    private func restorePurchases() async {
        await send(type: "restore-started")
        do {
            try await AppStore.sync()
            let active = await hasActiveEntitlement()
            await send(type: "restore-complete", extra: ["entitled": active])
        } catch {
            await send(type: "error", extra: ["message": "Apple could not restore purchases."])
        }
    }

    private func sendEntitlement() async {
        let active = await hasActiveEntitlement()
        await send(type: "entitlement", extra: ["entitled": active])
    }

    private func hasActiveEntitlement() async -> Bool {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard productIDs.contains(transaction.productID) else { continue }
            guard transaction.revocationDate == nil else { continue }

            if let expiration = transaction.expirationDate, expiration <= Date() {
                continue
            }
            return true
        }
        return false
    }

    private func periodString(_ period: Product.SubscriptionPeriod?) -> String {
        guard let period else { return "" }
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "period"
        }
        return period.value == 1 ? unit : "\(period.value) \(unit)s"
    }

    private func send(type: String, extra: [String: Any] = [:]) async {
        guard let webView else { return }

        var payload = extra
        payload["type"] = type

        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        let script = "window.__artflowIAPReceive && window.__artflowIAPReceive(\(json));"
        _ = try? await webView.evaluateJavaScript(script)
    }
}
