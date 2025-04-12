const axios = require("axios");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function prompt(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

const sessionPath = path.resolve("grab-session.json");

function getSession() {
    if (fs.existsSync(sessionPath)) {
        return JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    }
    return null;
}

function saveSession(fullData) {
    fs.writeFileSync(sessionPath, JSON.stringify(fullData, null, 2));
    console.log("✅ Data login disimpan ke grab-session.json\n");
}

async function loginLoop() {
    while (true) {
        const username = await prompt("Username: ");
        const password = await prompt("Password: ");

        try {
            const response = await axios.post(
                "https://merchant.grab.com/mex-core-api/user-profile/v1/login",
                {
                    username,
                    password,
                    without_force_logout: true,
                    login_source: "TROY_PORTAL_MAIN_USERNAME_PASSWORD",
                    session_data: {
                        web_session_data: {
                            user_agent: "Mozilla/5.0",
                            human_readable_user_agent: "CLI"
                        }
                    }
                },
                {
                    headers: {
                        "x-agent": "mexapp",
                        "x-app-platform": "web",
                        "x-app-version": "1.2(v67)",
                        "x-client-id": "GrabMerchant-Portal",
                        "x-language": "id",
                        "x-user-type": "user-profile",
                        "content-type": "application/json"
                    }
                }
            );

            const fullData = response.data.data.data;

            // Tambahkan waktu login
            fullData.loginTime = new Date().toISOString();

            saveSession(fullData);
            return fullData;
        } catch (err) {
            const msg =
                err.response?.data?.error?.msg || err.response?.data || err.message;
            console.error(`❌ Login gagal: ${msg}`);
            console.log("🔁 Silakan coba lagi.\n");
        }
    }
}

async function menu(session) {
    console.log("\nPilih fitur:");
    console.log("1. Get list product → simpan ke list-product.csv");
    console.log("2. Update product dari list-product.csv");
    console.log("3. Add product dari list-upload-new.csv");
    console.log("444. Delete product dari delete-product.csv\n");

    const choice = await prompt("Masukkan nomor pilihan: ");

    switch (choice.trim()) {
        case "1":
            await getListProduct(session);
            break;
        case "2":
            await updateProductsFromCSV(session);
            break;
        case "3":
            await addProductsFromCSV(session);
            break;
        case "444":
            await deleteProductsFromCSV(session);
            break;
        default:
            console.log("❌ Pilihan tidak valid.");
    }
    rl.close();
}

async function getListProduct(session) {
    try {
        // console.log({
        //     authorization: session.jwt,
        //     merchantid: session.user_profile.grab_food_entity_id,
        //     merchantgroupid: session.user_profile.links[0].link_entity_id,
        //     origin: "https://merchant.grab.com",
        //     referer: "https://merchant.grab.com/",
        //     requestsource: "troyPortal",
        //     "User-Agent":
        //         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        //     "accept": "application/json",
        //     "accept-language": "id",
        //     "priority": "u=1, i",
        //     "sec-ch-ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        //     "sec-ch-ua-mobile": "?0",
        //     "sec-ch-ua-platform": '"Windows"',
        //     "sec-fetch-dest": "empty",
        //     "sec-fetch-mode": "cors",
        //     "sec-fetch-site": "same-site",
        //     "x-session-id": "50cbaa89-f174-7c68-7cff-cf752922f3b6", // <-- kamu bisa generate UUID baru tiap waktu
        // })
        const res = await axios.get("https://api.grab.com/food/merchant/v2/menu", {
            headers: {
                authorization: session.jwt
            }
        });
        const items = res.data.categories.flatMap(cat =>
            cat.items.map(item => ({
                category: cat.categoryName,
                itemID: item.itemID,
                itemName: item.itemName,
                skuID: item.skuID,
                itemCode: item.itemCode,
                description: item.description,
                priceInMin: item.priceInMin,
                stock: item.weight?.count || 0,
                weight: item.weight?.value,
                unit: item.weight?.unit,
                imageURL: item.imageURL || '',
                itemClassID: item.itemClassID,
                sellingTimeID: item.sellingTimeID,
                categoryID: cat.categoryID,
                availableStatus: item.availableStatus,
            }))
        );

        const csv = stringify(items, { header: true });
        fs.writeFileSync("list-product.csv", csv);
        console.log("✅ list-product.csv berhasil dibuat.");
    } catch (err) {
        // console.log(err.response);
        console.error("❌ Gagal mengambil produk:", err.message);
    }
}

async function updateProductsFromCSV(session) {
    const filePath = "list-product.csv";
    const failPath = "list-product-gagal-update.csv";
    if (!fs.existsSync(filePath)) {
        console.log("❌ File list-product.csv tidak ditemukan.");
        return;
    }

    const content = fs.readFileSync(filePath);
    const products = parse(content, { columns: true });
    const failedUpdates = [];

    for (const item of products) {
        try {
            const payload = {
                item: {
                    itemID: item.itemID,
                    itemName: item.itemName,
                    availableStatus: parseInt(item.availableStatus),
                    priceDisplay: "",
                    sortOrder: 1,
                    description: item.description,
                    imageURL: item.imageURL,
                    priceInMin: parseInt(item.priceInMin),
                    weight: {
                        unit: item.unit,
                        count: parseInt(item.stock),
                        value: parseInt(item.weight)
                    },
                    itemCode: item.itemCode,
                    itemClassID: item.itemClassID,
                    specialItemType: "",
                    itemClassName: item.itemClassName,
                    skuID: item.skuID,
                    brandName: "",
                    itemStock: {
                        enableIms: item.enableIms === "true" || item.enableIms === true,
                        currentStock: parseInt(item.currentStock || 0),
                        enableRestock: false,
                        restockSetting: null
                    },
                    linkedModifierGroupIDs: null,
                    soldByWeight: false,
                    webPURL: item.webPURL || "",
                    sellingTimeID: item.sellingTimeID,
                    priceRange: "",
                    advancedPricing: {},
                    purchasability: {},
                    imageURLs: item.imageURL ? [item.imageURL] : [],
                    webPURLs: item.webPURL ? [item.webPURL] : [],
                    serviceTypePriceRange: {},
                    availableAt: "0001-01-01T00:00:00Z",
                    stockPrediction: null,
                    parentItemClassID: item.parentItemClassID || "",
                    parentItemClassName: item.parentItemClassName || "",
                    nameTranslation: null,
                    descriptionTranslation: null,
                    supportedAttributeClusterIDs: [],
                    prediction: {
                        isTobacco: false
                    },
                    menuScanError: null,
                    aiGeneratedFields: null,
                    suggestFields: null,
                    soldQuantity: 0,
                    itemCampaignInfo: null,
                    menuScanTaskMeta: null,
                    oosNonReplacementReason: "",
                    eligibleSellingStatus: "ELIGIBLE",
                    categoryID: item.categoryID
                },
                categoryID: item.categoryID,
                itemAttributeValues: null
            };

            const headers = {
                authorization: session.jwt,
                merchantid: session.user_profile.grab_food_entity_id,
                merchantgroupid: session.user_profile.links[0].link_entity_id,
                "content-type": "application/json",
                origin: "https://merchant.grab.com",
                referer: "https://merchant.grab.com/",
                requestsource: "troyPortal"
            };

            await axios.post("https://api.grab.com/food/merchant/v2/upsert-item", payload, { headers });
            console.log(`✅ Update: ${item.itemName}`);
            let avail = parseInt(item.stock) < 1 ? 3 : parseInt(item.availableStatus)
            await axios.put("https://api.grab.com/food/merchant/v1/items/available-status", {
                itemIDs: [item.itemID],
                availableStatus: avail
            }, { headers });

            console.log(`✅ Status diperbarui: ${item.itemName}`);
        } catch (err) {
            const errorMsg = err.response?.data?.error?.message || err.message;
            item.logError = errorMsg;
            failedUpdates.push(item);
            console.error(`❌ Gagal update ${item.itemName}:`, errorMsg);
        }
    }
// simpan list error
    if (failedUpdates.length) {
        fs.writeFileSync(failPath, stringify(failedUpdates, { header: true }));
        console.log(`⚠️  ${failedUpdates.length} gagal update disimpan ke ${failPath}`);
    }
}
async function addProductsFromCSV(session) {
    const uploadPath = "list-upload-new.csv";
    const samplePath = "sample-list-upload-new.csv";
    const failPath = "list-upload-new-gagal-add.csv";

    if (!fs.existsSync(uploadPath)) {
        console.log("⚠️  list-upload-new.csv tidak ditemukan.");

        if (!fs.existsSync(samplePath)) {
            const sample = [
                {
                    itemName: "Contoh Produk Baru",
                    skuID: "SKU123",
                    itemCode: "SKU123",
                    description: "Deskripsi produk",
                    priceInMin: 12000,
                    weight: 250,
                    imageURL: "",
                    itemClassID: "ISI_ID_KELAS_ITEM",
                    sellingTimeID: "ISI_ID_WAKTU",
                    categoryID: "ISI_ID_KATEGORI"
                }
            ];
            fs.writeFileSync(samplePath, stringify(sample, { header: true }));
            console.log("📄 sample-list-upload-new.csv telah dibuat.");
        }
        return;
    }

    const content = fs.readFileSync(uploadPath);
    const products = parse(content, { columns: true });
    const failedAdds = [];

    for (const item of products) {
        try {
            const payload = {
                item: {
                    itemName: item.itemName,
                    priceInMin: parseInt(item.priceInMin)*100,
                    itemCode: item.itemCode,
                    skuID: item.skuID,
                    itemClassID: item.itemClassID,
                    sellingTimeID: item.sellingTimeID,
                    categoryID: item.categoryID,
                    weight: {
                        unit: item.unit,
                        count: item.stock && parseInt(item.stock) > 0 ? parseInt(item.stock) : null,
                        value: parseInt(item.weight)
                    },
                    description: item.description,
                    prediction: { isTobacco: false },
                    imageURLs: item.imageURL ? [item.imageURL] : []
                },
                categoryID: item.categoryID,
                itemAttributeValues: []
            };

            await axios.post("https://api.grab.com/food/merchant/v2/upsert-item", payload, {
                headers: {
                    authorization: session.jwt,
                    merchantid: session.user_profile.grab_food_entity_id,
                    merchantgroupid: session.user_profile.links[0].link_entity_id,
                    "content-type": "application/json",
                    origin: "https://merchant.grab.com",
                    referer: "https://merchant.grab.com/",
                    requestsource: "troyPortal"
                }
            });

            console.log(`✅ Produk baru ditambahkan: ${item.itemName}`);
        } catch (err) {
            const errorMsg = err.response?.data?.message || err.message;
            item.logError = errorMsg;
            failedAdds.push(item);
            console.error(`❌ Gagal tambah ${item.itemName}:`, errorMsg);
        }
    }

    if (failedAdds.length) {
        fs.writeFileSync(failPath, stringify(failedAdds, { header: true }));
        console.log(`⚠️  ${failedAdds.length} gagal tambah disimpan ke ${failPath}`);
    }
}
async function deleteProductsFromCSV(session) {
    const deletePath = "delete-product.csv";
    const failPath = "delete-product-gagal-delete.csv";

    if (!fs.existsSync(deletePath)) {
        console.log("❌ File delete-product.csv tidak ditemukan.");
        return;
    }

    const content = fs.readFileSync(deletePath);
    const products = parse(content, { columns: true });
    const failed = [];

    const headers = {
        authorization: session.jwt,
        merchantid: session.user_profile.grab_food_entity_id,
        merchantgroupid: session.user_profile.links[0].link_entity_id,
        "content-type": "application/json",
        origin: "https://merchant.grab.com",
        referer: "https://merchant.grab.com/",
        requestsource: "troyPortal"
    };

    for (const item of products) {
        const itemID = item.itemID || item.itemId || item.id;
        if (!itemID) continue;

        const url = `https://api.grab.com/food/merchant/v2/items/${itemID}`;
        const payload = { itemID, menuGroupID: "" };

        try {
            await axios.delete(url, { headers, data: payload });
            console.log(`✅ Berhasil hapus: ${itemID}`);
        } catch (err) {
            const msg = err.response?.data?.error?.message || err.message;
            console.error(`❌ Gagal hapus ${itemID}: ${msg}`);
            failed.push({ ...item, logError: msg });
        }
    }

    if (failed.length) {
        fs.writeFileSync(failPath, stringify(failed, { header: true }));
        console.log(`📄 Log gagal disimpan di: ${failPath}`);
    }
}


(async () => {
    let session = getSession();
    if (!session) {
        console.log("🔐 Belum login. Silakan login terlebih dahulu.\n");
        session = await loginLoop();
    }
    await menu(session);
})();
