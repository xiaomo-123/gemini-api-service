#!/bin/bash

# Gemini API Service 安装脚本
# 用于在Linux环境下安装项目所需的环境和依赖

# 颜色定义
GREEN='[0;32m'
YELLOW='[1;33m'
RED='[0;31m'
NC='[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 安装系统依赖
install_system_deps() {
    print_info "安装系统依赖..."
    
    # 检测Linux发行版
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        print_info "检测到Debian/Ubuntu系统，使用apt包管理器"
        sudo apt-get update
        sudo apt-get install -y wget curl gnupg ca-certificates \
            libnss3-dev libatk-bridge2.0-dev libdrm2 libxkbcommon-dev \
            libxcomposite-dev libxdamage-dev libxrandr-dev libgbm-dev \
            libxss-dev libasound2-dev chromium
    elif [ -f /etc/redhat-release ]; then
        # RHEL/CentOS/Fedora
        print_info "检测到RHEL/CentOS/Fedora系统，使用yum包管理器"
        sudo yum update -y
        sudo yum install -y wget curl gcc gcc-c++ make \
            nss atk-bridge libXcomposite libXcursor libXdamage libXrandr \
            libgbm libXss alsa-lib chromium
    elif [ -f /etc/arch-release ]; then
        # Arch Linux
        print_info "检测到Arch Linux系统，使用pacman包管理器"
        sudo pacman -Syu --noconfirm
        sudo pacman -S --noconfirm wget curl base-devel \
            nss atk bridge libxcomposite libxcursor libxdamage libxrandr \
            libgbm libxss alsa-lib chromium
    else
        print_error "不支持的Linux发行版！"
        exit 1
    fi
}

# 安装Node.js
install_nodejs() {
    print_info "检查Node.js安装状态..."

    if command_exists node; then
        NODE_VERSION=$(node -v)
        print_info "Node.js已安装，版本: $NODE_VERSION"

        # 检查版本是否满足要求（需要Node.js >= 16）
        REQUIRED_VERSION="16.0.0"
        if [ "$(printf '%s
' "$REQUIRED_VERSION" "${NODE_VERSION#v}" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
            print_info "Node.js版本满足要求"
        else
            print_warning "Node.js版本过低，需要升级到v16或更高版本"
            exit 1
        fi
    else
        print_error "Node.js未安装，请先安装Node.js v16或更高版本"
        exit 1
    fi
}

# 安装项目依赖
install_dependencies() {
    print_info "安装项目依赖..."

    # 安装npm依赖
    npm install

    print_info "项目依赖安装完成"
}

# 创建必要的目录
create_directories() {
    print_info "创建必要的目录..."

    # 创建配置目录
    mkdir -p config

    # 创建日志目录
    mkdir -p logs

    print_info "目录创建完成"
}

# 创建启动脚本
create_start_script() {
    print_info "创建启动脚本..."

    cat > start.sh << 'EOF'
#!/bin/bash

# Gemini API Service 启动脚本

# 颜色定义
GREEN='[0;32m'
YELLOW='[1;33m'
NC='[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_info "启动 Gemini API Service..."

# 设置环境变量

export NODE_ENV=production
export ALLOWED_ORIGINS=
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=$(which chromium)


# 启动服务
node app.js
EOF

    chmod +x start.sh
    print_info "启动脚本创建完成"
}

# 主函数
main() {
    print_info "开始安装Gemini API Service环境..."

    install_system_deps
    install_nodejs
    create_directories
    install_dependencies
    create_start_script

    print_info "安装完成！"
    print_info "现在可以运行以下命令启动服务："
    echo -e "${YELLOW}./start.sh${NC}"
    print_info "服务将在 http://localhost:3101 上运行"
}

# 执行主函数
main
