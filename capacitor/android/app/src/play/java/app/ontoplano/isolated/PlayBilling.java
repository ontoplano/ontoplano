package app.ontoplano.isolated;

import android.app.Activity;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

/**
 * Google Play's purchase sheet, for the copy of the app Play distributes.
 *
 * Only in the `play` flavour: the Billing Library is not free software, and
 * every other build — F-Droid's above all — has to be buildable without it.
 * `MainActivity` registers this by name and finds nothing in those builds.
 *
 * The device's half of a purchase and nothing more. It opens the sheet and
 * hands back the purchase token; verifying it with Google, acknowledging it
 * and granting the plan are the server's (`/api/billing/play/claim`), because
 * a phone saying "they paid" is not evidence that anybody did. The account id
 * travels into Play as the obfuscated account id, which is how the server
 * still finds the account when the token never makes it back from here.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBilling extends Plugin implements PurchasesUpdatedListener {

    /** Play's limit on the obfuscated account id. */
    private static final int ACCOUNT_ID_MAX = 64;

    private BillingClient client;
    /** The one purchase in flight; a second press while it is open is refused. */
    private PluginCall pending;
    private String pendingProduct;

    /**
     * Buy, or find already bought, the subscription `product` for `account`.
     *
     * Answers `{ purchaseToken, product }`, or `{ cancelled: true }` when the
     * person closed the sheet. Rejects with Play's response code otherwise.
     */
    @PluginMethod
    public void subscribe(PluginCall call) {
        String product = call.getString("product", "");
        String account = call.getString("account", "");
        if (product == null || product.isEmpty() || account == null || account.isEmpty()
                || account.length() > ACCOUNT_ID_MAX) {
            call.reject("A product and an account, both.", "BAD_REQUEST");
            return;
        }
        if (pending != null) {
            call.reject("A purchase is already open.", "BUSY");
            return;
        }
        pending = call;
        pendingProduct = product;
        call.setKeepAlive(true);

        connect(() -> ownedOrBuy(product, account));
    }

    private void connect(Runnable then) {
        if (client == null) {
            client = BillingClient.newBuilder(getContext())
                    .setListener(this)
                    .enablePendingPurchases(
                            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                    .enableAutoServiceReconnection()
                    .build();
        }
        if (client.isReady()) {
            then.run();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) then.run();
                else fail(result);
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Reconnection is the library's own (`enableAutoServiceReconnection`).
            }
        });
    }

    /**
     * A subscription this Google account already holds is handed back rather
     * than sold twice — a reinstall, or a new phone, buys nothing.
     */
    private void ownedOrBuy(String product, String account) {
        client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build(),
                (result, purchases) -> {
                    Purchase owned = find(purchases, product);
                    if (owned != null) {
                        succeed(owned);
                        return;
                    }
                    buy(product, account);
                });
    }

    private void buy(String product, String account) {
        QueryProductDetailsParams query = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(product)
                                .setProductType(BillingClient.ProductType.SUBS)
                                .build()))
                .build();

        client.queryProductDetailsAsync(query, (result, details) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                fail(result);
                return;
            }
            List<ProductDetails> found = details.getProductDetailsList();
            if (found == null || found.isEmpty()) {
                reject("Play does not sell " + product + " to this account.", "UNKNOWN_PRODUCT");
                return;
            }
            ProductDetails item = found.get(0);
            String offer = offerFor(item);
            if (offer == null) {
                reject("Play offers no plan for " + product + ".", "NO_OFFER");
                return;
            }

            BillingFlowParams flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                    .setProductDetails(item)
                                    .setOfferToken(offer)
                                    .build()))
                    .setObfuscatedAccountId(account)
                    .build();

            Activity activity = getActivity();
            activity.runOnUiThread(() -> {
                BillingResult launched = client.launchBillingFlow(activity, flow);
                if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) fail(launched);
            });
        });
    }

    /**
     * Which offer to buy: one this account is eligible for (a free trial,
     * an introductory price) before the bare base plan.
     *
     * Play lists only the offers this account may take, so the first one with
     * an offer id is the one somebody new to the product should get.
     */
    private static String offerFor(ProductDetails item) {
        List<ProductDetails.SubscriptionOfferDetails> offers = item.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (offer.getOfferId() != null) return offer.getOfferToken();
        }
        return offers.get(0).getOfferToken();
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK) {
            Purchase bought = find(purchases, pendingProduct);
            if (bought != null) succeed(bought);
            else reject("Play answered without the purchase.", "EMPTY");
            return;
        }
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            PluginCall call = take();
            if (call == null) return;
            JSObject answer = new JSObject();
            answer.put("cancelled", true);
            call.resolve(answer);
            return;
        }
        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED && pendingProduct != null) {
            String product = pendingProduct;
            client.queryPurchasesAsync(
                    QueryPurchasesParams.newBuilder()
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build(),
                    (r, owned) -> {
                        Purchase found = find(owned, product);
                        if (found != null) succeed(found);
                        else fail(result);
                    });
            return;
        }
        fail(result);
    }

    private static Purchase find(List<Purchase> purchases, String product) {
        if (purchases == null || product == null) return null;
        for (Purchase purchase : purchases) {
            if (purchase.getProducts().contains(product)) return purchase;
        }
        return null;
    }

    private void succeed(Purchase purchase) {
        PluginCall call = take();
        if (call == null) return;
        JSObject answer = new JSObject();
        answer.put("purchaseToken", purchase.getPurchaseToken());
        answer.put("product", productOf(purchase));
        call.resolve(answer);
    }

    private static String productOf(Purchase purchase) {
        List<String> products = purchase.getProducts();
        return products.isEmpty() ? "" : products.get(0);
    }

    private void fail(BillingResult result) {
        reject(result.getDebugMessage(), "PLAY_" + result.getResponseCode());
    }

    private void reject(String message, String code) {
        PluginCall call = take();
        if (call != null) call.reject(message, code);
    }

    /** The open call, released — whatever happens to it, it happens once. */
    private PluginCall take() {
        PluginCall call = pending;
        pending = null;
        pendingProduct = null;
        if (call != null) call.setKeepAlive(false);
        return call;
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) client.endConnection();
        client = null;
    }
}
