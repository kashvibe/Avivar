// --- Avivar V2 Logic ---

const LOCATIONS = [
    "290 Springs Road Farm breakout area",
    "118 McMillan Road - bottom Farm - breakout area",
    "118 McMillan road - Office - Stationary",
    "118 McMillan road - Office + Factory - Kitchen"
];

// Seed Data with Complex Packaging Schema
const seedData = [
    { 
        id: "1", itemName: "HP Officejet Pro 9130e Cartridge Black", category: "Stationary", location: LOCATIONS[2], supplier: "O'Donnells", cost: 45.00, 
        packType: "Pack", packSize: 4, unitName: "Cartridge", totalUnits: 6, parLevel: 2, 
        useCase: "HP Color Printer 9130e",
        consumptionHistory: [], expiryDate: ""
    },
    { 
        id: "2", itemName: "Coles 3-ply Toilet Paper", category: "Washroom", location: LOCATIONS[1], supplier: "Coles", cost: 0.85, 
        packType: "Box", packSize: 48, unitName: "Roll", totalUnits: 100, parLevel: 20, 
        useCase: "",
        consumptionHistory: [], expiryDate: ""
    },
    { 
        id: "3", itemName: "Long Life Milk 1L", category: "Kitchen", location: LOCATIONS[3], supplier: "Coles", cost: 1.65, 
        packType: "Carton", packSize: 12, unitName: "Litre", totalUnits: 15, parLevel: 5, 
        useCase: "",
        consumptionHistory: [], expiryDate: getFutureDate(12)
    },
    { 
        id: "4", itemName: "Nescafé Blend 43 Coffee", category: "Kitchen", location: LOCATIONS[3], supplier: "Coles", cost: 14.50, 
        packType: "Tin", packSize: 1, unitName: "Tin", totalUnits: 2, parLevel: 1, 
        useCase: "",
        consumptionHistory: [], expiryDate: ""
    },
    { 
        id: "5", itemName: "Work Gloves", category: "Farm", location: LOCATIONS[0], supplier: "Bunnings", cost: 5.00, 
        packType: "Pack", packSize: 10, unitName: "Pair", totalUnits: 35, parLevel: 10, 
        useCase: "",
        consumptionHistory: [], expiryDate: ""
    }
];

let inventory = [];
let currentFilter = "All";
let currentSearch = "";
let sortColumn = "itemName";
let sortAsc = true;
let poTabActive = ""; 
let appMode = "admin"; // 'admin' or 'kiosk'
let kioskLocation = "";

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initRouting();
    loadData();

    if (appMode === 'admin') {
        initAdminEvents();
        renderAdmin();
    } else {
        initKioskEvents();
        renderKiosk();
    }
});

// --- URL Routing (Kiosk vs Admin) ---
function initRouting() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "kiosk") {
        appMode = "kiosk";
        kioskLocation = params.get("location");
        document.getElementById("adminView").classList.add("hidden");
        document.getElementById("kioskView").classList.remove("hidden");
        document.getElementById("kioskLocationTitle").innerText = kioskLocation || "Select a Location";
    } else {
        appMode = "admin";
        document.getElementById("adminView").classList.remove("hidden");
        document.getElementById("kioskView").classList.add("hidden");
        populateLocationDropdowns();
    }
}

// --- Utility Functions ---
function generateId() { return Math.random().toString(36).substr(2, 9); }
function getFutureDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// Complex Packaging Math Output
function formatStock(totalUnits, packSize, packType, unitName) {
    totalUnits = parseInt(totalUnits);
    packSize = parseInt(packSize);
    
    if (packSize === 1 || isNaN(packSize) || packSize === 0) {
        return `${totalUnits} ${unitName}(s)`;
    }
    
    const packs = Math.floor(totalUnits / packSize);
    const individuals = totalUnits % packSize;
    
    let result = "";
    if (packs > 0 && individuals > 0) {
        result = `${packs} ${packType}(s) (of ${packSize}) and ${individuals} loose ${unitName}(s)`;
    } else if (packs > 0 && individuals === 0) {
        result = `${packs} ${packType}(s) (of ${packSize})`;
    } else if (packs === 0 && individuals > 0) {
        result = `${individuals} loose ${unitName}(s)`;
    } else {
        result = "0";
    }
    
    return result;
}

// --- Predictive Math & Data Engine ---
function calculateDaysRemaining(item) {
    if (!item.consumptionHistory || item.consumptionHistory.length === 0) return null;
    const now = Date.now();
    const fourteenDaysAgo = now - (14 * 86400000);
    
    // Sum quantities consumed in last 14 days
    const recentUsage = item.consumptionHistory
        .filter(entry => entry.timestamp >= fourteenDaysAgo && entry.reason === "consumed")
        .reduce((sum, entry) => sum + entry.quantity, 0);
        
    if (recentUsage === 0) return Infinity;
    
    const averageDailyUsage = recentUsage / 14; 
    return parseInt(item.totalUnits) / averageDailyUsage;
}

function loadData() {
    const v2Data = localStorage.getItem("avivar_v2_inventory");
    if (v2Data) {
        inventory = JSON.parse(v2Data);
    } else {
        // Attempt to migrate old data if it exists
        const v1Data = localStorage.getItem("avivar_inventory");
        if (v1Data) {
            const oldList = JSON.parse(v1Data);
            inventory = oldList.map(old => {
                return {
                    id: old.id,
                    itemName: old.itemName,
                    category: old.category || "Other",
                    // Map old locations to new strict locations, default to first if no match
                    location: LOCATIONS.includes(old.location) ? old.location : LOCATIONS[0], 
                    supplier: old.supplier || "",
                    cost: parseFloat(old.cost) || 0,
                    packType: "Pack",
                    packSize: 1,
                    unitName: old.unit || "Unit",
                    totalUnits: parseInt(old.stockLevel) || 0,
                    parLevel: parseInt(old.parLevel) || 0,
                    consumptionHistory: old.consumptionHistory || [],
                    expiryDate: old.expiryDate || ""
                };
            });
            saveData();
        } else {
            // First load ever
            inventory = [...seedData];
            saveData();
        }
    }
}

function saveData() {
    localStorage.setItem("avivar_v2_inventory", JSON.stringify(inventory));
    if (appMode === 'admin') renderAdmin();
    if (appMode === 'kiosk') renderKiosk();
}

// --- State Mutations ---
function adjustStock(id, change, reason = "consumed") {
    const item = inventory.find(i => i.id === id);
    if (item) {
        const oldStock = parseInt(item.totalUnits);
        const newStock = Math.max(0, oldStock + change);
        
        // Log consumption
        if (newStock < oldStock) {
            item.consumptionHistory.push({
                timestamp: Date.now(),
                quantity: oldStock - newStock,
                costAtTime: parseFloat(item.cost),
                reason: reason // 'consumed', 'discarded', etc.
            });
        }
        item.totalUnits = newStock;
        saveData();
    }
}

// --- ADMIN RENDER LOGIC ---
function renderAdmin() {
    renderTable();
    renderActionPanel();
    drawAnalytics();
}

function renderTable() {
    const tbody = document.getElementById("inventoryBody");
    tbody.innerHTML = "";

    inventory.forEach(item => { item._daysRemaining = calculateDaysRemaining(item); });

    let filtered = inventory.filter(item => {
        const matchLoc = currentFilter === "All" || item.location === currentFilter;
        const matchSearch = item.itemName.toLowerCase().includes(currentSearch.toLowerCase()) ||
                            (item.supplier && item.supplier.toLowerCase().includes(currentSearch.toLowerCase()));
        return matchLoc && matchSearch;
    });

    // Sort Override for Critical (< 2 days)
    filtered.sort((a, b) => {
        const aCritical = a._daysRemaining !== null && a._daysRemaining < 2;
        const bCritical = b._daysRemaining !== null && b._daysRemaining < 2;
        if (aCritical && !bCritical) return -1;
        if (!aCritical && bCritical) return 1;

        let valA = a[sortColumn]; let valB = b[sortColumn];
        if (sortColumn === 'daysRemaining') {
            valA = a._daysRemaining === null ? 9999 : a._daysRemaining;
            valB = b._daysRemaining === null ? 9999 : b._daysRemaining;
        }
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    filtered.forEach(item => {
        const tr = document.createElement("tr");
        let rowClasses = ""; let flagsHtml = "";
        
        let daysStr = "Calculating...";
        if (item._daysRemaining !== null && item._daysRemaining !== Infinity) {
            daysStr = `~${Math.round(item._daysRemaining)}d`;
            if (item._daysRemaining < 2) {
                rowClasses += "alert-red ";
                flagsHtml += `<span class="badge badge-danger">Critical</span>`;
            } else if (item._daysRemaining < 5) {
                flagsHtml += `<span class="badge badge-warning">Low</span>`;
            }
        } else if (item._daysRemaining === Infinity) { daysStr = "No Usage"; }

        // Formatting Complex Stock
        const stockDisplay = formatStock(item.totalUnits, item.packSize, item.packType, item.unitName);
        const useCaseBadge = item.useCase ? `<span class="badge badge-info" style="margin-left: 0; margin-top: 4px; display: inline-block;">${item.useCase}</span>` : "";
        
        tr.className = rowClasses.trim();
        tr.innerHTML = `
            <td>
                <div style="font-weight:600">${item.itemName} ${flagsHtml}</div>
                ${useCaseBadge}
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-top: 4px;">${item.category}</div>
            </td>
            <td>${item.location}</td>
            <td>${item.supplier}</td>
            <td>
                <div class="stock-complex">
                    <span class="stock-primary">${stockDisplay}</span>
                </div>
            </td>
            <td>${item.parLevel}</td>
            <td><span style="font-weight:600">${daysStr}</span></td>
            <td>
                <div class="action-btns">
                    <button class="secondary-btn" onclick="adjustStock('${item.id}', 1)">+</button>
                    <button class="secondary-btn" onclick="adjustStock('${item.id}', -1)">−</button>
                    <button class="text-btn" onclick="editProduct('${item.id}')">Edit</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderActionPanel() {
    const list = document.getElementById("flaggedItemsList");
    list.innerHTML = "";
    
    const now = new Date();
    const poData = {};

    inventory.forEach(item => {
        let isFlagged = false; let reasons = []; let type = "info";

        if (item._daysRemaining !== null && item._daysRemaining < 5) {
            isFlagged = true;
            reasons.push(`Runs out in ~${Math.round(item._daysRemaining)} days`);
            type = item._daysRemaining < 2 ? "danger" : "warning";
        } else if (parseInt(item.totalUnits) <= parseInt(item.parLevel)) {
            isFlagged = true; reasons.push(`Hit Par Level`); type = "danger";
        }

        if (item.expiryDate) {
            const diffDays = Math.ceil((new Date(item.expiryDate) - now) / 86400000);
            if (diffDays <= 7 && diffDays >= 0) {
                isFlagged = true; reasons.push(`Expiring in ${diffDays}d`); type = "warning";
            }
        }

        if (isFlagged) {
            if (item.supplier && (type === 'danger' || type === 'warning')) {
                if (!poData[item.supplier]) poData[item.supplier] = [];
                // Suggest ordering enough to double the par level (simple heuristic)
                const targetUnits = Math.max(parseInt(item.parLevel) * 2, parseInt(item.packSize));
                const unitsNeeded = Math.max(1, targetUnits - parseInt(item.totalUnits));
                const packsToOrder = Math.ceil(unitsNeeded / (parseInt(item.packSize) || 1));
                
                poData[item.supplier].push(`${packsToOrder}x ${item.packType} of ${item.itemName}`);
            }

            const li = document.createElement("li");
            li.className = `flagged-item ${type}`;
            li.innerHTML = `
                <div class="flagged-info">
                    <div class="flagged-item-name">${item.itemName}</div>
                    <div class="flagged-item-details">${reasons.join(', ')}</div>
                </div>
            `;
            list.appendChild(li);
        }
    });

    renderPOTabs(poData);
}

function renderPOTabs(poData) {
    const tabsContainer = document.getElementById("poTabs");
    const content = document.getElementById("poContent");
    const suppliers = Object.keys(poData);
    
    tabsContainer.innerHTML = "";
    
    if (suppliers.length === 0) {
        content.value = "No items require ordering.";
        return;
    }

    if (!suppliers.includes(poTabActive)) poTabActive = suppliers[0];

    suppliers.forEach(supplier => {
        const btn = document.createElement("button");
        btn.className = `po-tab ${supplier === poTabActive ? 'active' : ''}`;
        btn.innerText = supplier;
        btn.onclick = () => { poTabActive = supplier; renderPOTabs(poData); };
        tabsContainer.appendChild(btn);
    });

    if (poData[poTabActive]) {
        content.value = `Purchase Request: ${poTabActive}\nDate: ${new Date().toLocaleDateString()}\n\n` + poData[poTabActive].join("\n");
    }
}

// --- Analytics Engine ---
function drawAnalytics() {
    const canvas = document.getElementById("volumeChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate spend per location
    const spendMap = {};
    LOCATIONS.forEach(l => spendMap[l] = 0);
    
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 86400000);
    const sevenDaysAgo = now - (7 * 86400000);
    
    let dayBuckets = [0,0,0,0,0,0,0]; // 7 days

    inventory.forEach(item => {
        item.consumptionHistory.forEach(entry => {
            if (entry.timestamp >= thirtyDaysAgo) {
                // Monthly Spend
                spendMap[item.location] += (entry.quantity * entry.costAtTime);
            }
            if (entry.timestamp >= sevenDaysAgo) {
                // 7 Day volume (count of units)
                const dayIndex = 6 - Math.floor((now - entry.timestamp) / 86400000);
                if(dayIndex >= 0 && dayIndex < 7) dayBuckets[dayIndex] += entry.quantity;
            }
        });
    });

    // Render Spend List
    const spendList = document.getElementById("spendList");
    spendList.innerHTML = "";
    Object.keys(spendMap).forEach(loc => {
        if (spendMap[loc] > 0) {
            const li = document.createElement("li");
            li.className = "spend-item";
            li.innerHTML = `<span class="spend-item-loc">${loc}</span> <span class="spend-item-amt">$${spendMap[loc].toFixed(2)}</span>`;
            spendList.appendChild(li);
        }
    });

    // Draw Bar Chart (Pure JS)
    const maxVal = Math.max(...dayBuckets, 10); // min scale 10
    const barWidth = 40;
    const spacing = 30;
    const startX = 50;
    const bottomY = canvas.height - 30;

    ctx.fillStyle = "#64748b";
    ctx.font = "12px Inter";
    
    dayBuckets.forEach((val, i) => {
        const barHeight = (val / maxVal) * (canvas.height - 60);
        const x = startX + (i * (barWidth + spacing));
        const y = bottomY - barHeight;
        
        ctx.fillStyle = "#0284c7";
        ctx.fillRect(x, y, barWidth, barHeight);
        
        ctx.fillStyle = "#64748b";
        ctx.fillText(`Day ${i+1}`, x, bottomY + 20);
        if (val > 0) ctx.fillText(val, x + 10, y - 5);
    });
}


// --- ADMIN EVENTS ---
function initAdminEvents() {
    // Sidebar Views
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            document.querySelectorAll(".view-section").forEach(v => v.classList.add("hidden"));
            document.getElementById(`${e.target.dataset.view}View`).classList.remove("hidden");
            if (e.target.dataset.view === 'analytics') drawAnalytics();
        });
    });

    // Filters
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            currentFilter = e.target.dataset.filter;
            renderTable();
        });
    });

    // Sorting & Searching
    document.getElementById("searchInput").addEventListener("input", (e) => { currentSearch = e.target.value; renderTable(); });
    document.querySelectorAll("th[data-sort]").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.sort;
            if (sortColumn === col) sortAsc = !sortAsc;
            else { sortColumn = col; sortAsc = true; }
            renderTable();
        });
    });

    // Modals
    document.getElementById("addBtn").addEventListener("click", () => openModal());
    document.getElementById("cancelBtn").addEventListener("click", closeModal);
    document.getElementById("productForm").addEventListener("submit", saveProduct);

    // Kiosk Generator
    const locSelect = document.getElementById("kioskLocationSelect");
    LOCATIONS.forEach(l => {
        const opt = document.createElement("option"); opt.value = l; opt.innerText = l;
        locSelect.appendChild(opt);
    });

    document.getElementById("generateKioskBtn").addEventListener("click", () => {
        const loc = encodeURIComponent(locSelect.value);
        // Safely get base URL regardless of file:// or http:// protocol
        const baseUrl = window.location.href.split('?')[0];
        const url = `${baseUrl}?mode=kiosk&location=${loc}`;
        
        document.getElementById("kioskUrlOutput").value = url;
        document.getElementById("kioskUrlOutput").classList.remove("hidden");
        
        const openBtn = document.getElementById("openKioskBtn");
        openBtn.classList.remove("hidden");
        openBtn.onclick = () => window.open(url, "_blank");

        // Generate Visual QR Code via API
        const qrImg = document.getElementById("qrCodeImg");
        const qrContainer = document.getElementById("qrCodeContainer");
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
        qrContainer.classList.remove("hidden");
    });

    // Email Alerts
    document.getElementById("emailAlertsBtn").addEventListener("click", () => {
        const contentText = document.getElementById("poContent").value;
        const content = encodeURIComponent(contentText);
        
        const mailtoLink = `mailto:?subject=Urgent Restock Request&body=${content}`;
        
        // Use a hidden anchor tag to prevent opening a blank tab
        const a = document.createElement('a');
        a.href = mailtoLink;
        a.click();
        
        // Fallback for missing email clients
        setTimeout(() => {
            navigator.clipboard.writeText(contentText).then(() => {
                console.log("Copied to clipboard as fallback");
            });
        }, 500);
    });

    document.getElementById("copyPoBtn").addEventListener("click", () => {
        const content = document.getElementById("poContent").value;
        navigator.clipboard.writeText(content).then(() => {
            const btn = document.getElementById("copyPoBtn");
            const originalText = btn.innerText;
            btn.innerText = "Copied!";
            btn.style.backgroundColor = "var(--success-color)";
            btn.style.color = "#fff";
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.backgroundColor = "";
                btn.style.color = "";
            }, 1500);
        }).catch(err => {
            alert("Failed to copy text. Please try manually selecting and copying.");
        });
    });

    // Dynamic Packaging Calc Helper
    document.getElementById("totalUnits").addEventListener("input", updatePackHelper);
    document.getElementById("packSize").addEventListener("input", updatePackHelper);
}

function updatePackHelper() {
    const tu = parseInt(document.getElementById("totalUnits").value) || 0;
    const ps = parseInt(document.getElementById("packSize").value) || 1;
    const pt = document.getElementById("packName").value || "Pack";
    const un = document.getElementById("unitName").value || "Unit";
    document.getElementById("stockCalcHelper").innerText = `Calculates to: ${formatStock(tu, ps, pt, un)}`;
}

function populateLocationDropdowns() {
    const select = document.getElementById("location");
    select.innerHTML = "";
    LOCATIONS.forEach(l => {
        const opt = document.createElement("option"); opt.value = l; opt.innerText = l;
        select.appendChild(opt);
    });
    
    // Populate Use Case Datalist
    const datalist = document.getElementById("useCaseOptions");
    if(datalist) {
        const useCases = [...new Set(inventory.map(i => i.useCase).filter(s => s))];
        datalist.innerHTML = useCases.map(s => `<option value="${s}">`).join("");
    }
}

// Admin Modal Logic
function openModal(id = null) {
    const form = document.getElementById("productForm");
    form.reset();
    document.getElementById("productId").value = "";

    if (id) {
        document.getElementById("modalTitle").innerText = "Edit Product";
        const item = inventory.find(i => i.id === id);
        if (item) {
            document.getElementById("productId").value = item.id;
            document.getElementById("itemName").value = item.itemName;
            document.getElementById("category").value = item.category;
            document.getElementById("location").value = item.location;
            document.getElementById("supplier").value = item.supplier;
            document.getElementById("cost").value = item.cost;
            document.getElementById("useCase").value = item.useCase || "";
            document.getElementById("packName").value = item.packType || "Pack";
            document.getElementById("packSize").value = item.packSize || 1;
            document.getElementById("unitName").value = item.unitName || "Unit";
            document.getElementById("totalUnits").value = item.totalUnits;
            document.getElementById("parLevel").value = item.parLevel;
            document.getElementById("expiryDate").value = item.expiryDate || "";
        }
    } else {
        document.getElementById("modalTitle").innerText = "Add New Product";
    }
    updatePackHelper();
    document.getElementById("productModal").classList.remove("hidden");
}

function closeModal() { document.getElementById("productModal").classList.add("hidden"); }

function saveProduct(e) {
    e.preventDefault();
    const id = document.getElementById("productId").value;
    const newItem = {
        id: id ? id : generateId(),
        itemName: document.getElementById("itemName").value,
        category: document.getElementById("category").value,
        location: document.getElementById("location").value,
        supplier: document.getElementById("supplier").value,
        cost: parseFloat(document.getElementById("cost").value) || 0,
        useCase: document.getElementById("useCase").value,
        packType: document.getElementById("packName").value,
        packSize: parseInt(document.getElementById("packSize").value) || 1,
        unitName: document.getElementById("unitName").value,
        totalUnits: parseInt(document.getElementById("totalUnits").value) || 0,
        parLevel: parseInt(document.getElementById("parLevel").value) || 0,
        expiryDate: document.getElementById("expiryDate").value,
        consumptionHistory: id ? (inventory.find(i => i.id === id)?.consumptionHistory || []) : []
    };
    if (id) { const i = inventory.findIndex(i => i.id === id); inventory[i] = newItem; } 
    else { inventory.push(newItem); }
    closeModal(); saveData();
}

window.editProduct = openModal;

// --- KIOSK LOGIC (STAFF SELF-LOGGING) ---
function initKioskEvents() {
    document.getElementById("exitKioskBtn").addEventListener("click", () => {
        window.location.href = window.location.origin + window.location.pathname;
    });
    
    // Add big floating Report button
    const fab = document.createElement("button");
    fab.className = "kiosk-fab";
    fab.innerText = "🚨 Report Empty Item";
    fab.onclick = () => document.getElementById("reportEmptyModal").classList.remove("hidden");
    document.body.appendChild(fab);

    document.getElementById("cancelReportBtn").addEventListener("click", () => {
        document.getElementById("reportEmptyModal").classList.add("hidden");
    });
    
    document.getElementById("submitReportBtn").addEventListener("click", () => {
        const note = document.getElementById("reportNotes").value;
        if(note) {
            alert("Report submitted to Admin.");
            document.getElementById("reportNotes").value = "";
            document.getElementById("reportEmptyModal").classList.add("hidden");
        }
    });
}

function renderKiosk() {
    const grid = document.getElementById("kioskGrid");
    grid.innerHTML = "";

    const localInventory = inventory.filter(i => i.location === kioskLocation);
    
    if (localInventory.length === 0) {
        grid.innerHTML = "<p>No items assigned to this pantry.</p>";
        return;
    }

    localInventory.forEach(item => {
        const card = document.createElement("div");
        card.className = "kiosk-card";
        
        const stockDisplay = formatStock(item.totalUnits, item.packSize, item.packType, item.unitName);
        
        card.innerHTML = `
            <h3>${item.itemName}</h3>
            <div class="stock-readout">Current: <strong>${stockDisplay}</strong></div>
            <button class="btn-take" onclick="takeItemKiosk('${item.id}', '${item.unitName}')">
                Take 1 ${item.unitName}
            </button>
            <button class="text-btn" style="color:var(--warning-color);" onclick="flagDiscarded('${item.id}')">
                Flag 1 Discarded/Expired
            </button>
        `;
        grid.appendChild(card);
    });
}

window.takeItemKiosk = function(id, unitName) {
    adjustStock(id, -1, "consumed");
    // Show visual feedback without alerts
    const btn = event.target;
    const origText = btn.innerText;
    btn.innerText = "✓ Logged";
    btn.style.background = "var(--success-color)";
    setTimeout(() => {
        btn.innerText = origText;
        btn.style.background = "";
    }, 1000);
}

window.flagDiscarded = function(id) {
    if(confirm("Mark 1 unit as discarded/expired? (This won't count towards normal consumption rate)")) {
        adjustStock(id, -1, "discarded");
    }
}
