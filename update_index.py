import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update text for instant key to within 2 hrs (max 24 hrs)
content = content.replace('Instant Key Delivery (10 Mins)', 'Key via Email & WhatsApp: within 2 hrs (Max 24 hrs)')
content = content.replace('Instant license key delivery via Email & WhatsApp upon verification.', 'License key delivered to your Email & WhatsApp within 2 hours (Max 24 hours).')
content = content.replace('Instant Email & WhatsApp License Key Delivery (within 10 mins)', 'License key delivered to Email & WhatsApp within 2 hours (Max 24 hours)')
content = content.replace('Instant digital delivery with complete step-by-step installation instructions.', 'License key delivered via Email & WhatsApp within 2 hours (Max 24 hours).')
content = content.replace('Instant Key', 'Key in 2-24 Hrs')

# 2. Add "My Orders & Tracking" in Sidebar navigation
sidebar_target = '''        <a href="#services" onclick="navigate('services'); closeSidebar(); return false;" class="flex items-center gap-3 p-3 rounded-2xl hover:bg-blue-50 hover:text-brandBlue transition">
          <span class="text-base">🔧</span>
          <span>All Doorstep Services</span>
        </a>'''

sidebar_replacement = '''        <a href="#my-orders" onclick="openMyOrdersModal(); closeSidebar(); return false;" class="flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 transition border border-emerald-200/80 shadow-xs hover:shadow-md">
          <div class="flex items-center gap-3">
            <span class="text-base">📦</span>
            <span class="font-extrabold">My Orders & Tracking</span>
          </div>
          <span class="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">Track Live</span>
        </a>
        <a href="#services" onclick="navigate('services'); closeSidebar(); return false;" class="flex items-center gap-3 p-3 rounded-2xl hover:bg-blue-50 hover:text-brandBlue transition">
          <span class="text-base">🔧</span>
          <span>All Doorstep Services</span>
        </a>'''

if sidebar_target in content:
    content = content.replace(sidebar_target, sidebar_replacement, 1)
    print("Added My Orders button to Sidebar successfully")
else:
    print("WARNING: sidebar_target not found")

# 3. Re-order sections in #view-home:
# Original order: why_choose (406-535), experts (535-565), services (565-701)
# Target order: trust_cards, services, experts, why_choose

lines = content.splitlines(keepends=True)

def find_line(pattern):
    for i, line in enumerate(lines):
        if pattern in line:
            return i
    return -1

why_start = find_line('<section id="why-choose-us-section"')
exp_start = find_line('<section id="experts-section"')
svc_start = find_line('<section id="services-section"')
rev_start = find_line('<!-- REAL GOOGLE REVIEWS SECTION -->')

print(f"Indices: why_start={why_start}, exp_start={exp_start}, svc_start={svc_start}, rev_start={rev_start}")

# Lines:
# why_comment starts at why_start - 1
why_comment = why_start - 1 if "<!-- MODERN BENTO GRID" in lines[why_start - 1] else why_start
exp_comment = exp_start - 1 if "<!-- MEET OUR EXPERTS" in lines[exp_start - 1] else exp_start
svc_comment = svc_start - 1 if "<!-- MODERN OUR SERVICES" in lines[svc_start - 1] else svc_start

why_block = "".join(lines[why_comment:exp_comment])
exp_block = "".join(lines[exp_comment:svc_comment])
svc_block = "".join(lines[svc_comment:rev_start])

trust_cards_block = """      <!-- COMPACT 2-CARD HORIZONTAL TRUST HIGHLIGHTS (USER REQUEST POINT 6) -->
      <section id="trust-cards-section" class="py-6 sm:py-8 bg-slate-50 border-b border-slate-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            
            <!-- Card 1: ISO 9001:2015 & Level-4 Chipset Lab -->
            <div class="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs hover:shadow-md transition flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-3 mb-2.5">
                  <div class="w-10 h-10 rounded-xl bg-blue-50 text-brandBlue flex items-center justify-center font-bold text-lg border border-blue-100 flex-shrink-0">
                    ⚙️
                  </div>
                  <div>
                    <h3 class="text-sm sm:text-base font-extrabold text-brandNavy font-heading">ISO 9001:2015 Operations & Level-4 Chipset Lab</h3>
                    <p class="text-[11px] text-slate-500">Sterile cleanroom benchmarks & micro-soldering precision across all 6 metros</p>
                  </div>
                </div>
                <p class="text-xs text-slate-600 leading-relaxed mb-3">
                  Calibrated ESD anti-static diagnostics for Apple MacBook, iMac, Lenovo, Dell, and gaming PC motherboards with 100% genuine OEM replacement parts.
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                <span class="text-[10px] font-bold bg-blue-50 text-brandBlue px-2.5 py-1 rounded-md border border-blue-100">✓ ISO 9001:2015 Operations</span>
                <span class="text-[10px] font-bold bg-purple-50 text-purple-700 px-2.5 py-1 rounded-md border border-purple-100">⚡ Level-4 Chipset Masters</span>
                <span class="text-[10px] font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md">🍎 MacBook & PC Lab</span>
                <span class="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md">🛡️ 100% Genuine OEM Spares</span>
              </div>
            </div>

            <!-- Card 2: 6 Months Warranty & No Fix - No Fees Policy -->
            <div class="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs hover:shadow-md transition flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-3 mb-2.5">
                  <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-lg border border-amber-100 flex-shrink-0">
                    🛡️
                  </div>
                  <div>
                    <h3 class="text-sm sm:text-base font-extrabold text-brandNavy font-heading">6 Months Assured Warranty & No Fix – No Fee Guarantee</h3>
                    <p class="text-[11px] text-slate-500">100% upfront quote approved before opening screws • Zero risk service</p>
                  </div>
                </div>
                <p class="text-xs text-slate-600 leading-relaxed mb-3">
                  If our certified engineers cannot solve your laptop or computer hardware fault, you pay ₹0 service fee. Enjoy free doorstep revisit warranty support.
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                <span class="text-[10px] font-bold bg-amber-50 text-amber-800 px-2.5 py-1 rounded-md border border-amber-200">🛡️ 6 Months Doorstep Warranty</span>
                <span class="text-[10px] font-bold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md border border-emerald-200">💰 No Fix – No Fees (₹0 If Unsolved)</span>
                <span class="text-[10px] font-bold bg-blue-50 text-brandBlue px-2.5 py-1 rounded-md">📋 100% Upfront Pricing</span>
                <span class="text-[10px] font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md">⚡ 60-Minute Arrival</span>
              </div>
            </div>

          </div>
        </div>
      </section>

"""

new_sections_assembled = trust_cards_block + svc_block + exp_block + why_block

lines_before = "".join(lines[:why_comment])
lines_after = "".join(lines[rev_start:])

content = lines_before + new_sections_assembled + lines_after
print("Reordered homepage sections: Trust Cards -> Services -> Experts -> Why Choose Us")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved intermediate updates to index.html")
