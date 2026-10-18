const { useState, useEffect } = React;

    function App() {
      // Auth State
      const [isLoggedIn, setIsLoggedIn] = useState(false);
      const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
      const [currentUser, setCurrentUser] = useState(null);

      // Controlled Inputs State for Auth
      const [loginEmail, setLoginEmail] = useState('admin@coffee.com');
      const [loginPassword, setLoginPassword] = useState('');
      const [regName, setRegName] = useState('');
      const [regEmail, setRegEmail] = useState('');
      const [regPassword, setRegPassword] = useState('');

      // App Navigation State
      const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'orders', 'products', 'customers', 'payment'

      // Search & Filter State
      const [searchQuery, setSearchQuery] = useState('');
      const [productFilter, setProductFilter] = useState('All');

      // Data States
      const [products, setProducts] = useState([]);
      const [customers, setCustomers] = useState([]);
      const [orders, setOrders] = useState([]);

      // Today's totals from persisted orders
      const [liveRevenue, setLiveRevenue] = useState(0);
      const [liveOrdersCount, setLiveOrdersCount] = useState(0);

      // Toast Alert State
      const [toast, setToast] = useState(null);

      const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
      };

      const updateDailySummary = (dailyOrders) => {
        const today = new Date();
        const todayOrders = dailyOrders.filter((order) => {
          const createdAt = new Date(order.createdAt);
          return createdAt.toDateString() === today.toDateString();
        });
        setLiveRevenue(todayOrders.reduce(
          (sum, order) => sum + (order.status === 'Cancelled' ? 0 : order.total),
          0
        ));
        setLiveOrdersCount(todayOrders.length);
      };

      const loadDashboardData = async () => {
        const [productsResult, customersResult, ordersResult] = await Promise.all([
          supabaseClient.from('products').select('*').order('id'),
          supabaseClient.from('customers').select('*').order('id'),
          supabaseClient.from('orders').select('*').order('created_at', { ascending: false })
        ]);

        const failedResult = [productsResult, customersResult, ordersResult].find((result) => result.error);
        if (failedResult) {
          showToast(`Không tải được dữ liệu Supabase: ${failedResult.error.message}`, 'error');
          return false;
        }

        setProducts(productsResult.data.map((product) => ({
          ...product,
          desc: product.description
        })));
        setCustomers(customersResult.data.map((customer) => ({
          ...customer,
          totalSpent: customer.total_spent
        })));

        const loadedOrders = ordersResult.data.map((order) => ({
          id: order.order_number,
          customer: order.customer_name,
          items: order.items,
          total: order.total,
          status: order.status,
          time: new Date(order.created_at).toLocaleString('vi-VN'),
          paymentMethod: order.payment_method,
          createdAt: order.created_at
        }));
        setOrders(loadedOrders);
        updateDailySummary(loadedOrders);
        return true;
      };

      const authorizeAdmin = async (user) => {
        const { data, error } = await supabaseClient
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          showToast(`Không kiểm tra được quyền quản trị: ${error.message}`, 'error');
          return false;
        }
        if (!data || data.role !== 'admin') {
          showToast('Tài khoản chưa được cấp quyền admin trong bảng user_roles.', 'error');
          return false;
        }
        return true;
      };

      const activateAdminSession = async (user) => {
        if (!(await authorizeAdmin(user))) {
          const { error } = await supabaseClient.auth.signOut();
          if (error) showToast(`Không thể đóng phiên đăng nhập: ${error.message}`, 'error');
          return false;
        }
        if (!(await loadDashboardData())) {
          const { error } = await supabaseClient.auth.signOut();
          if (error) showToast(`Không thể đóng phiên đăng nhập: ${error.message}`, 'error');
          return false;
        }
        setCurrentUser({
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Quản trị viên',
          email: user.email
        });
        setIsLoggedIn(true);
        return true;
      };

      useEffect(() => {
        if (!supabaseClient) {
          showToast('Hãy thêm publishable/anon key vào src/supabase-config.js.', 'error');
          return;
        }

        let active = true;
        const restoreSession = async () => {
          const { data, error } = await supabaseClient.auth.getSession();
          if (!active) return;
          if (error) {
            showToast(`Không khôi phục được phiên đăng nhập: ${error.message}`, 'error');
            return;
          }
          if (data.session) {
            await activateAdminSession(data.session.user);
          }
        };
        restoreSession();
        return () => {
          active = false;
        };
      }, []);

      useEffect(() => {
        if (!isLoggedIn) return;
        const channel = supabaseClient
          .channel('coffee-management-data')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, loadDashboardData)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, loadDashboardData)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadDashboardData)
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              showToast('Không thể kết nối kênh cập nhật thời gian thực của Supabase.', 'error');
            }
          });
        return () => {
          supabaseClient.removeChannel(channel);
        };
      }, [isLoggedIn]);

      // Lucide icons render trigger
      useEffect(() => {
        if (window.lucide) {
          window.lucide.createIcons();
        }
      }, [isLoggedIn, authMode, activeTab, orders, products, customers, productFilter]);

      const handleLogin = async (e) => {
        e.preventDefault();
        if (!supabaseClient) {
          showToast('Hãy cấu hình Supabase trong src/supabase-config.js trước khi đăng nhập.', 'error');
          return;
        }
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: loginEmail,
          password: loginPassword
        });
        if (error) {
          showToast(`Đăng nhập thất bại: ${error.message}`, 'error');
          return;
        }
        if (await activateAdminSession(data.user)) {
          showToast('Đăng nhập Supabase thành công.');
        }
      };

      const handleRegister = async (e) => {
        e.preventDefault();
        if (!regEmail || !regPassword) {
          showToast("Vui lòng điền đầy đủ thông tin đăng ký", "info");
          return;
        }
        if (!supabaseClient) {
          showToast('Hãy cấu hình Supabase trong src/supabase-config.js trước khi đăng ký.', 'error');
          return;
        }
        const { data, error } = await supabaseClient.auth.signUp({
          email: regEmail,
          password: regPassword,
          options: { data: { full_name: regName } }
        });
        if (error) {
          showToast(`Đăng ký thất bại: ${error.message}`, 'error');
          return;
        }
        if (data.session) {
          const { error: signOutError } = await supabaseClient.auth.signOut();
          if (signOutError) {
            showToast(`Đã tạo tài khoản nhưng không thể đóng phiên tạm: ${signOutError.message}`, 'error');
            return;
          }
        }
        setLoginEmail(regEmail);
        setAuthMode('login');
        showToast('Đã tạo tài khoản. Hãy cấp role admin trong Supabase rồi đăng nhập.', 'info');
      };

      const handlePasswordReset = async (e) => {
        e.preventDefault();
        if (!supabaseClient || !loginEmail) {
          showToast('Nhập email hợp lệ và cấu hình Supabase trước khi đặt lại mật khẩu.', 'error');
          return;
        }
        const { error } = await supabaseClient.auth.resetPasswordForEmail(loginEmail);
        if (error) {
          showToast(`Không gửi được email đặt lại mật khẩu: ${error.message}`, 'error');
          return;
        }
        showToast('Đã gửi hướng dẫn đặt lại mật khẩu qua email.', 'info');
      };

      const handleLogout = async () => {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
          showToast(`Đăng xuất thất bại: ${error.message}`, 'error');
          return;
        }
        setIsLoggedIn(false);
        setCurrentUser(null);
        showToast("Đã đăng xuất khỏi hệ thống.", "info");
      };

      // Order Functions
      const createSampleOrder = async () => {
        if (!products.length) {
          showToast('Chưa có sản phẩm trong cơ sở dữ liệu để tạo đơn.', 'error');
          return;
        }
        const randomProd = products[Math.floor(Math.random() * products.length)];
        const orderNumber = `ORD-${Date.now()}`;
        const orderPayload = {
          order_number: orderNumber,
          customer_name: `Khách Tại Bàn #${Math.floor(Math.random() * 15 + 1)}`,
          items: [`${randomProd.name} (x1)`],
          total: randomProd.price,
          status: 'Processing',
          payment_method: 'Chuyển khoản QR'
        };
        const { data, error } = await supabaseClient
          .from('orders')
          .insert(orderPayload)
          .select()
          .single();
        if (error) {
          showToast(`Không tạo được đơn hàng: ${error.message}`, 'error');
          return;
        }
        const newOrder = {
          id: data.order_number,
          customer: data.customer_name,
          items: data.items,
          total: data.total,
          status: data.status,
          time: new Date(data.created_at).toLocaleString('vi-VN'),
          paymentMethod: data.payment_method,
          createdAt: data.created_at
        };
        const updatedOrders = [newOrder, ...orders];
        setOrders(updatedOrders);
        updateDailySummary(updatedOrders);
        showToast(`Tạo đơn hàng mới ${newOrder.id} thành công!`);
      };

      const updateOrderStatus = async (id, newStatus) => {
        const { error } = await supabaseClient
          .from('orders')
          .update({ status: newStatus })
          .eq('order_number', id)
          .select('id')
          .single();
        if (error) {
          showToast(`Không cập nhật được đơn hàng ${id}: ${error.message}`, 'error');
          return;
        }
        const updatedOrders = orders.map((order) => (
          order.id === id ? { ...order, status: newStatus } : order
        ));
        setOrders(updatedOrders);
        updateDailySummary(updatedOrders);
        showToast(`Cập nhật đơn hàng ${id} sang trạng thái: ${newStatus}`);
      };

      if (!isLoggedIn) {
        return (
          <div class="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-coffee-900 via-[#1a100c] to-[#0a0604] relative overflow-hidden">
            {toast && (
              <div class={`fixed top-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl shadow-xl border text-sm ${
                toast.type === 'error'
                  ? 'bg-red-950/95 border-red-700 text-red-100'
                  : 'bg-coffee-800/95 border-coffee-600 text-amber-100'
              }`}>
                {toast.message}
              </div>
            )}
            {/* Background Blur Orbs */}
            <div class="absolute -top-24 -left-24 w-96 h-96 bg-coffee-600/20 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -bottom-24 -right-24 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none"></div>

            <div class="w-full max-w-md bg-[#18110e]/90 backdrop-blur-md border border-coffee-800/50 rounded-2xl p-8 shadow-2xl relative z-10">
              {/* Brand Logo Header */}
              <div class="text-center mb-8">
                <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-coffee-500 to-coffee-800 rounded-2xl mb-3 shadow-lg shadow-coffee-950/50">
                  <i data-lucide="coffee" class="w-8 h-8 text-amber-100"></i>
                </div>
                <h1 class="text-2xl font-bold font-serif text-amber-100 tracking-wide">COFFEE MANAGEMENT</h1>
                <p class="text-xs text-coffee-400 mt-1">Hệ thống quản trị và vận hành quán cà phê chuyên nghiệp</p>
              </div>

              {/* Form Tabs */}
              <div class="flex bg-coffee-950/60 p-1 rounded-xl mb-6 border border-coffee-900">
                <button 
                  onClick={() => setAuthMode('login')} 
                  class={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${authMode === 'login' ? 'bg-coffee-600 text-white shadow-md' : 'text-coffee-400 hover:text-amber-200'}`}
                >
                  Đăng Nhập
                </button>
                <button 
                  onClick={() => setAuthMode('register')} 
                  class={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${authMode === 'register' ? 'bg-coffee-600 text-white shadow-md' : 'text-coffee-400 hover:text-amber-200'}`}
                >
                  Đăng Ký
                </button>
              </div>

              {/* Login Form */}
              {authMode === 'login' ? (
                <form onSubmit={handleLogin} class="space-y-4">
                  <div>
                    <label class="block text-xs font-semibold uppercase text-coffee-300 mb-1">Email / Tài khoản</label>
                    <div class="relative">
                      <i data-lucide="mail" class="w-4 h-4 absolute left-3 top-3 text-coffee-500"></i>
                      <input 
                        type="email" 
                        required 
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="admin@coffee.com" 
                        class="w-full bg-coffee-950/80 border border-coffee-800 focus:border-coffee-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-amber-100 outline-none transition"
                      />
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold uppercase text-coffee-300 mb-1">Mật khẩu</label>
                    <div class="relative">
                      <i data-lucide="lock" class="w-4 h-4 absolute left-3 top-3 text-coffee-500"></i>
                      <input 
                        type="password" 
                        required 
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••" 
                        class="w-full bg-coffee-950/80 border border-coffee-800 focus:border-coffee-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-amber-100 outline-none transition"
                      />
                    </div>
                  </div>
                  <div class="flex items-center justify-between text-xs text-coffee-400">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" class="accent-coffee-600 rounded" defaultChecked />
                      <span>Ghi nhớ đăng nhập</span>
                    </label>
                    <a href="#" onClick={handlePasswordReset} class="hover:text-amber-300 transition">Quên mật khẩu?</a>
                  </div>
                  <button type="submit" class="w-full bg-gradient-to-r from-coffee-600 to-coffee-700 hover:from-coffee-500 hover:to-coffee-600 text-white font-medium py-3 rounded-xl shadow-lg shadow-coffee-900/50 transition duration-200 mt-2 flex items-center justify-center gap-2">
                    <span>Đăng Nhập Hệ Thống</span>
                    <i data-lucide="arrow-right" class="w-4 h-4"></i>
                  </button>
                </form>
              ) : (
                /* Register Form */
                <form onSubmit={handleRegister} class="space-y-4">
                  <div>
                    <label class="block text-xs font-semibold uppercase text-coffee-300 mb-1">Họ & Tên Quản Lý</label>
                    <div class="relative">
                      <i data-lucide="user" class="w-4 h-4 absolute left-3 top-3 text-coffee-500"></i>
                      <input 
                        type="text" 
                        required 
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Nguyễn Văn A" 
                        class="w-full bg-coffee-950/80 border border-coffee-800 focus:border-coffee-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-amber-100 outline-none transition"
                      />
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold uppercase text-coffee-300 mb-1">Email đăng ký</label>
                    <div class="relative">
                      <i data-lucide="mail" class="w-4 h-4 absolute left-3 top-3 text-coffee-500"></i>
                      <input 
                        type="email" 
                        required 
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="manager@quancaphe.com" 
                        class="w-full bg-coffee-950/80 border border-coffee-800 focus:border-coffee-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-amber-100 outline-none transition"
                      />
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold uppercase text-coffee-300 mb-1">Mật khẩu</label>
                    <div class="relative">
                      <i data-lucide="lock" class="w-4 h-4 absolute left-3 top-3 text-coffee-500"></i>
                      <input 
                        type="password" 
                        required 
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="••••••••" 
                        class="w-full bg-coffee-950/80 border border-coffee-800 focus:border-coffee-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-amber-100 outline-none transition"
                      />
                    </div>
                  </div>
                  <button type="submit" class="w-full bg-gradient-to-r from-coffee-600 to-coffee-700 hover:from-coffee-500 hover:to-coffee-600 text-white font-medium py-3 rounded-xl shadow-lg shadow-coffee-900/50 transition duration-200 mt-2 flex items-center justify-center gap-2">
                    <span>Đăng Ký Tài Khoản</span>
                    <i data-lucide="user-plus" class="w-4 h-4"></i>
                  </button>
                </form>
              )}

              <div class="mt-6 pt-6 border-t border-coffee-900 text-center text-xs text-coffee-500">
                Dự án Coffee Management &copy; 2026. Phát triển cho hệ thống quản lý chuỗi cà phê.
              </div>
            </div>
          </div>
        );
      }

      return (
        <div class="min-h-screen flex flex-col md:flex-row bg-[#120c0a] text-amber-50 relative">
          {/* Toast Notification */}
          {toast && (
            <div class={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border transition-all duration-300 ${
              toast.type === 'info'
                ? 'bg-blue-900/90 border-blue-700 text-blue-100'
                : toast.type === 'error'
                  ? 'bg-red-950/95 border-red-700 text-red-100'
                  : 'bg-coffee-800/95 border-coffee-600 text-amber-100'
            }`}>
              <i data-lucide={toast.type === 'error' ? 'alert-circle' : toast.type === 'info' ? 'info' : 'check-circle'} class="w-5 h-5 text-amber-400"></i>
              <span class="text-sm font-medium">{toast.message}</span>
            </div>
          )}

          {/* Sidebar Navigation */}
          <aside class="w-full md:w-64 bg-[#18110e] border-r border-coffee-900 flex-shrink-0 flex flex-col justify-between">
            <div>
              {/* Header Logo */}
              <div class="p-6 border-b border-coffee-900 flex items-center gap-3">
                <div class="w-10 h-10 bg-gradient-to-br from-coffee-500 to-coffee-800 rounded-xl flex items-center justify-center shadow-md">
                  <i data-lucide="coffee" class="w-6 h-6 text-amber-100"></i>
                </div>
                <div>
                  <h2 class="font-serif font-bold text-lg text-amber-100 leading-tight">MIND COFFEE</h2>
                  <span class="text-[10px] tracking-widest text-coffee-400 uppercase font-semibold">Management</span>
                </div>
              </div>

              {/* Nav Menu */}
              <nav class="p-4 space-y-1">
                {[
                  { id: 'overview', label: 'Trang Chủ Tổng Quan', icon: 'layout-dashboard' },
                  { id: 'orders', label: 'Quản Lý Đơn Hàng', icon: 'shopping-bag' },
                  { id: 'products', label: 'Quản Lý Sản Phẩm', icon: 'cup-soda' },
                  { id: 'customers', label: 'Quản Lý Khách Hàng', icon: 'users' },
                  { id: 'payment', label: 'Thanh Toán & Cổng Nạp', icon: 'credit-card' },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    class={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition duration-200 ${
                      activeTab === item.id 
                        ? 'bg-coffee-800/80 text-amber-100 border border-coffee-600/50 shadow-md' 
                        : 'text-coffee-400 hover:bg-coffee-950 hover:text-amber-200'
                    }`}
                  >
                    <i data-lucide={item.icon} class="w-5 h-5"></i>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* User Profile & Logout Section */}
            <div class="p-4 border-t border-coffee-900 bg-coffee-950/40">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-full bg-coffee-700 flex items-center justify-center text-amber-100 font-bold border border-coffee-500">
                    {currentUser?.name?.charAt(0).toUpperCase() || "A"}
                  </div>
                  <div class="overflow-hidden">
                    <p class="text-sm font-medium text-amber-100 truncate">{currentUser?.name}</p>
                    <p class="text-[11px] text-coffee-400 truncate">Quản trị viên</p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout} 
                  title="Đăng xuất"
                  class="p-2 text-coffee-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition"
                >
                  <i data-lucide="log-out" class="w-5 h-5"></i>
                </button>
              </div>
            </div>
          </aside>

          {/* Main Dashboard Content Area */}
          <main class="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
            
            {/* Top Bar Banner / Header */}
            <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-coffee-900/80">
              <div>
                <h1 class="text-2xl md:text-3xl font-bold font-serif text-amber-100 tracking-tight">
                  DỰ ÁN COFFEE MANAGEMENT
                </h1>
                <p class="text-sm text-coffee-400 mt-1">
                  Mô tả: Hệ thống quản lý các hoạt động kinh doanh của một quán cà phê, nhằm hỗ trợ việc quản lý đơn hàng, khách hàng và dữ liệu một cách hiệu quả.
                </p>
              </div>
              <div class="flex items-center gap-3">
                <button 
                  onClick={createSampleOrder}
                  class="bg-coffee-600 hover:bg-coffee-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2"
                >
                  <i data-lucide="plus-circle" class="w-4 h-4"></i>
                  <span>Tạo Đơn Hàng Mới</span>
                </button>
              </div>
            </header>

            {/* TAB 1: OVERVIEW / DASHBOARD */}
            {activeTab === 'overview' && (
              <div class="space-y-8">
                {/* Hero Banner giống hệt thiết kế mẫu trong ảnh slide */}
                <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2a1810] via-[#1f120c] to-[#120a07] border border-coffee-800 shadow-2xl p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div class="space-y-4 max-w-xl z-10">
                    <span class="inline-block px-3 py-1 bg-coffee-800/80 border border-coffee-600 text-amber-300 text-xs font-semibold uppercase tracking-wider rounded-full">
                      Mind Coffee Presentation
                    </span>
                    <h2 class="text-3xl md:text-4xl font-serif font-bold text-amber-100 leading-tight">
                      Bắt đầu ngày với một tách đen đá không đường...
                    </h2>
                    <p class="text-coffee-300 text-sm leading-relaxed">
                      Chào mừng bạn đến với mô hình quản lý Mind Coffee - nơi kết hợp tinh hoa hương vị cà phê và trải nghiệm công nghệ quản trị tinh gọn.
                    </p>
                    <div class="pt-2 flex flex-wrap gap-3">
                      <button onClick={() => setActiveTab('products')} class="bg-amber-600 hover:bg-amber-500 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition shadow-lg">
                        Mua Ngay / Xem Menu
                      </button>
                      <button onClick={() => setActiveTab('orders')} class="bg-coffee-950/80 hover:bg-coffee-900 border border-coffee-700 text-amber-200 font-medium px-5 py-2.5 rounded-xl text-sm transition">
                        Xem Đơn Hàng
                      </button>
                    </div>
                  </div>

                  {/* Decorative Card Image Simulation */}
                  <div class="w-full md:w-72 bg-gradient-to-b from-coffee-900/60 to-coffee-950/80 border border-coffee-700/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center relative shadow-xl backdrop-blur-sm">
                    <div class="text-6xl mb-3 animate-pulse">☕</div>
                    <span class="text-xs uppercase font-bold tracking-widest text-coffee-400">Mind Coffee Special</span>
                    <span class="text-lg font-serif font-bold text-amber-200 mt-1">Đen Đá Không Đường</span>
                    <span class="text-xs text-coffee-300 mt-2">Hạt Robusta Đắk Lắk nguyên chất 100%</span>
                  </div>
                </div>

                {/* REAL-TIME DATA / DASHBOARD ANALYTICS */}
                <div>
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold font-serif text-amber-100 flex items-center gap-2">
                      <i data-lucide="activity" class="w-5 h-5 text-amber-500"></i>
                      <span>Dữ Liệu Thời Gian Thực (Real-time Analytics)</span>
                    </h3>
                    <span class="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                      <span class="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span>
                      Đang đồng bộ trực tiếp
                    </span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl p-5 shadow-lg">
                      <div class="flex items-center justify-between text-coffee-400 mb-2">
                        <span class="text-xs font-semibold uppercase">Doanh Thu Hôm Nay</span>
                        <i data-lucide="dollar-sign" class="w-5 h-5 text-amber-400"></i>
                      </div>
                      <div class="text-2xl font-bold text-amber-100">
                        {liveRevenue.toLocaleString('vi-VN')} đ
                      </div>
                      <p class="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                        <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
                        <span>+14.5% so với hôm qua</span>
                      </p>
                    </div>

                    <div class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl p-5 shadow-lg">
                      <div class="flex items-center justify-between text-coffee-400 mb-2">
                        <span class="text-xs font-semibold uppercase">Tổng Số Đơn Hàng</span>
                        <i data-lucide="shopping-cart" class="w-5 h-5 text-amber-400"></i>
                      </div>
                      <div class="text-2xl font-bold text-amber-100">
                        {liveOrdersCount} đơn
                      </div>
                      <p class="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                        <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
                        <span>+8 đơn trong giờ qua</span>
                      </p>
                    </div>

                    <div class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl p-5 shadow-lg">
                      <div class="flex items-center justify-between text-coffee-400 mb-2">
                        <span class="text-xs font-semibold uppercase">Sản Phẩm Trong Menu</span>
                        <i data-lucide="coffee" class="w-5 h-5 text-amber-400"></i>
                      </div>
                      <div class="text-2xl font-bold text-amber-100">
                        {products.length} Món
                      </div>
                      <p class="text-xs text-coffee-400 mt-2">
                        Đang sẵn sàng phục vụ
                      </p>
                    </div>

                    <div class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl p-5 shadow-lg">
                      <div class="flex items-center justify-between text-coffee-400 mb-2">
                        <span class="text-xs font-semibold uppercase">Khách Hàng Thành Viên</span>
                        <i data-lucide="users" class="w-5 h-5 text-amber-400"></i>
                      </div>
                      <div class="text-2xl font-bold text-amber-100">
                        {customers.length} Thành viên
                      </div>
                      <p class="text-xs text-amber-400 mt-2">
                        Tích điểm & Ưu đãi
                      </p>
                    </div>
                  </div>
                </div>

                {/* Các Khía Cạnh Chính Của Dự Án (Chính xác theo các gạch đầu dòng trong ảnh slide) */}
                <div class="bg-coffee-950/50 border border-coffee-900 rounded-2xl p-6">
                  <h3 class="text-lg font-serif font-bold text-amber-100 mb-4">
                    Dưới đây là các khía cạnh chính của ý tưởng:
                  </h3>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { title: "Quản lý đơn hàng", desc: "Theo dõi trạng thái đơn hàng (Đang xử lý, Hoàn thành, Hủy), tạo đơn nhanh chóng.", tab: "orders" },
                      { title: "Quản lý sản phẩm", desc: "Cập nhật menu cà phê, danh mục đồ uống, giá cả và tồn kho.", tab: "products" },
                      { title: "Quản lý khách hàng", desc: "Lưu trữ thông tin khách hàng, hạng thành viên và điểm thưởng tích lũy.", tab: "customers" },
                      { title: "Dữ liệu thời gian thực", desc: "Biểu đồ thống kê nhảy số sống động, cập nhật doanh thu trực tiếp.", tab: "overview" },
                      { title: "Tích hợp hệ thống thanh toán", desc: "Hỗ trợ nhiều hình thức thanh toán (QR Code, Tiền mặt, Thẻ) có thể mở rộng.", tab: "payment" },
                    ].map((item, idx) => (
                      <div key={idx} class="p-4 bg-coffee-900/30 border border-coffee-800/60 rounded-xl hover:border-coffee-600 transition cursor-pointer" onClick={() => setActiveTab(item.tab)}>
                        <h4 class="font-semibold text-amber-200 text-sm flex items-center gap-2">
                          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                          <span>{item.title}</span>
                        </h4>
                        <p class="text-xs text-coffee-400 mt-2 leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: QUẢN LÝ ĐƠN HÀNG */}
            {activeTab === 'orders' && (
              <div class="space-y-6">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 class="text-xl font-serif font-bold text-amber-100">Quản Lý Đơn Hàng (Order Management)</h2>
                  <button onClick={createSampleOrder} class="bg-coffee-600 hover:bg-coffee-500 text-white text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 self-start sm:self-auto">
                    <i data-lucide="plus" class="w-4 h-4"></i> Tạo đơn mới
                  </button>
                </div>

                <div class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl overflow-hidden shadow-xl">
                  <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                      <thead>
                        <tr class="bg-coffee-900/60 border-b border-coffee-800 text-coffee-300 text-xs uppercase">
                          <th class="p-4">Mã Đơn</th>
                          <th class="p-4">Khách Hàng</th>
                          <th class="p-4">Sản Phẩm Chi Tiết</th>
                          <th class="p-4">Tổng Tiền</th>
                          <th class="p-4">Thanh Toán</th>
                          <th class="p-4">Trạng Thái</th>
                          <th class="p-4 text-right">Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-coffee-900/80 text-sm">
                        {orders.map((order) => (
                          <tr key={order.id} class="hover:bg-coffee-900/20 transition">
                            <td class="p-4 font-mono font-semibold text-amber-200">{order.id}</td>
                            <td class="p-4 text-amber-100">{order.customer}</td>
                            <td class="p-4 text-coffee-300">{order.items.join(", ")}</td>
                            <td class="p-4 font-bold text-amber-200">{order.total.toLocaleString('vi-VN')} đ</td>
                            <td class="p-4 text-xs text-coffee-400">{order.paymentMethod}</td>
                            <td class="p-4">
                              <span class={`px-2.5 py-1 text-xs rounded-full font-medium ${
                                order.status === 'Completed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                order.status === 'Processing' ? 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse' :
                                'bg-red-950 text-red-400 border border-red-800'
                              }`}>
                                {order.status === 'Completed' ? 'Hoàn thành' : order.status === 'Processing' ? 'Đang xử lý' : 'Đã hủy'}
                              </span>
                            </td>
                            <td class="p-4 text-right space-x-2">
                              {order.status === 'Processing' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'Completed')} 
                                  class="text-xs bg-emerald-800 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg transition"
                                >
                                  Hoàn thành
                                </button>
                              )}
                              {order.status !== 'Cancelled' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'Cancelled')} 
                                  class="text-xs bg-red-900/60 hover:bg-red-800 text-red-200 px-2.5 py-1 rounded-lg transition"
                                >
                                  Hủy đơn
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: QUẢN LÝ SẢN PHẨM */}
            {activeTab === 'products' && (
              <div class="space-y-6">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 class="text-xl font-serif font-bold text-amber-100">Quản Lý Sản Phẩm & Thực Đơn (Product Management)</h2>
                  <button onClick={()=>showToast("Chức năng thêm món mới sẵn sàng!", "info")} class="bg-coffee-600 hover:bg-coffee-500 text-white text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 self-start sm:self-auto">
                    <i data-lucide="plus" class="w-4 h-4"></i> Thêm món mới
                  </button>
                </div>

                {/* Filters & Category Tags */}
                <div class="flex flex-wrap gap-2">
                  {['All', 'Cà Phê Truyền Thống', 'Cà Phê Máy', 'Trà & Trái Cây'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setProductFilter(cat)}
                      class={`px-3.5 py-1.5 text-xs font-medium rounded-xl border transition ${
                        productFilter === cat 
                          ? 'bg-coffee-600 border-coffee-500 text-white shadow-md' 
                          : 'bg-coffee-950/60 border-coffee-800 text-coffee-400 hover:text-amber-200'
                      }`}
                    >
                      {cat === 'All' ? 'Tất cả sản phẩm' : cat}
                    </button>
                  ))}
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products
                    .filter(p => productFilter === 'All' || p.category === productFilter)
                    .map((prod) => (
                      <div key={prod.id} class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-coffee-600 transition">
                        <div>
                          <div class="flex items-center justify-between mb-3">
                            <span class="text-4xl">{prod.image}</span>
                            <span class="text-[11px] bg-coffee-900 text-coffee-300 px-2.5 py-1 rounded-full border border-coffee-800">
                              {prod.category}
                            </span>
                          </div>
                          <h3 class="font-serif font-bold text-lg text-amber-100">{prod.name}</h3>
                          <p class="text-xs text-coffee-400 mt-1 line-clamp-2">{prod.desc}</p>
                          <p class="text-amber-400 font-bold text-lg mt-3">{prod.price.toLocaleString('vi-VN')} đ</p>
                        </div>

                        <div class="mt-6 pt-4 border-t border-coffee-900 flex items-center justify-between text-xs text-coffee-400">
                          <span>Tồn kho: <strong class="text-amber-200">{prod.stock}</strong></span>
                          <span>Đã bán: <strong class="text-amber-200">{prod.sales}</strong></span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* TAB 4: QUẢN LÝ KHÁCH HÀNG */}
            {activeTab === 'customers' && (
              <div class="space-y-6">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 class="text-xl font-serif font-bold text-amber-100">Quản Lý Khách Hàng (Customer Management)</h2>
                  <button onClick={()=>showToast("Thêm thông tin khách hàng mới!", "info")} class="bg-coffee-600 hover:bg-coffee-500 text-white text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 self-start sm:self-auto">
                    <i data-lucide="user-plus" class="w-4 h-4"></i> Thêm khách hàng
                  </button>
                </div>

                <div class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl overflow-hidden shadow-xl">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="bg-coffee-900/60 border-b border-coffee-800 text-coffee-300 text-xs uppercase">
                        <th class="p-4">Tên Khách Hàng</th>
                        <th class="p-4">Số Điện Thoại</th>
                        <th class="p-4">Hạng Thành Viên</th>
                        <th class="p-4">Điểm Tích Lũy</th>
                        <th class="p-4 text-right">Tổng Chi Tiêu</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-coffee-900/80 text-sm">
                      {customers.map((cust) => (
                        <tr key={cust.id} class="hover:bg-coffee-900/20 transition">
                          <td class="p-4 font-semibold text-amber-100">{cust.name}</td>
                          <td class="p-4 text-coffee-300">{cust.phone}</td>
                          <td class="p-4">
                            <span class={`px-2.5 py-1 text-xs rounded-full font-bold ${
                              cust.tier === 'Kim Cương' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                              cust.tier === 'Vàng' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                              'bg-coffee-900 text-coffee-300 border border-coffee-700'
                            }`}>
                              {cust.tier}
                            </span>
                          </td>
                          <td class="p-4 font-mono text-amber-300">{cust.points} pt</td>
                          <td class="p-4 text-right font-bold text-amber-200">{cust.totalSpent.toLocaleString('vi-VN')} đ</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: TÍCH HỢP THANH TOÁN */}
            {activeTab === 'payment' && (
              <div class="space-y-6">
                <div class="flex items-center justify-between">
                  <h2 class="text-xl font-serif font-bold text-amber-100">Tích Hợp Hệ Thống Thanh Toán (Payment Integration)</h2>
                  <span class="text-xs text-amber-400 bg-coffee-900 px-3 py-1 rounded-full border border-coffee-800">Mở rộng linh hoạt</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Momo / QR Payment Option */}
                  <div class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                    <div>
                      <div class="w-12 h-12 bg-pink-900/40 rounded-xl flex items-center justify-center text-pink-400 mb-4 border border-pink-800/50">
                        <i data-lucide="qr-code" class="w-6 h-6"></i>
                      </div>
                      <h3 class="font-serif font-bold text-lg text-amber-100">Thanh Toán Chuyển Khoản QR</h3>
                      <p class="text-xs text-coffee-400 mt-2 leading-relaxed">Quét mã QR qua ứng dụng Ngân hàng / MoMo tự động xác nhận đơn hàng trong vài giây.</p>
                    </div>
                    <button onClick={()=>showToast("Đã kích hoạt cổng QR Code!", "info")} class="mt-6 w-full bg-coffee-800 hover:bg-coffee-700 text-amber-100 text-xs font-semibold py-2.5 rounded-xl transition">
                      Cấu hình Cổng QR
                    </button>
                  </div>

                  {/* Cash Option */}
                  <div class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                    <div>
                      <div class="w-12 h-12 bg-emerald-900/40 rounded-xl flex items-center justify-center text-emerald-400 mb-4 border border-emerald-800/50">
                        <i data-lucide="banknote" class="w-6 h-6"></i>
                      </div>
                      <h3 class="font-serif font-bold text-lg text-amber-100">Tiền Mặt Tại Quầy</h3>
                      <p class="text-xs text-coffee-400 mt-2 leading-relaxed">Xác nhận thanh toán trực tiếp tại thu ngân và in hóa đơn tức thì cho khách hàng.</p>
                    </div>
                    <button onClick={()=>showToast("Thanh toán tiền mặt hoạt động!", "info")} class="mt-6 w-full bg-coffee-800 hover:bg-coffee-700 text-amber-100 text-xs font-semibold py-2.5 rounded-xl transition">
                      Quản lý Ngăn kéo tiền
                    </button>
                  </div>

                  {/* POS / Card Option */}
                  <div class="bg-coffee-950/80 border border-coffee-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                    <div>
                      <div class="w-12 h-12 bg-blue-900/40 rounded-xl flex items-center justify-center text-blue-400 mb-4 border border-blue-800/50">
                        <i data-lucide="credit-card" class="w-6 h-6"></i>
                      </div>
                      <h3 class="font-serif font-bold text-lg text-amber-100">Máy Quẹt Thẻ POS / VISA</h3>
                      <p class="text-xs text-coffee-400 mt-2 leading-relaxed">Tích hợp thiết bị máy quẹt thẻ POS không dây phục vụ thanh toán thẻ nội địa & quốc tế.</p>
                    </div>
                    <button onClick={()=>showToast("Kết nối máy POS sẵn sàng!", "info")} class="mt-6 w-full bg-coffee-800 hover:bg-coffee-700 text-amber-100 text-xs font-semibold py-2.5 rounded-xl transition">
                      Kết nối Thiết bị
                    </button>
                  </div>
                </div>
              </div>
            )}

          </main>
        </div>
      );
    }

    ReactDOM.render(<App />, document.getElementById('root'));
