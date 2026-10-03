locals {
  cloud_config = {
    package_update = true
    packages       = ["ca-certificates", "curl", "git", "python3", "iptables"]
    ssh_pwauth     = false
    disable_root   = true
    write_files = [
      {
        path        = "/usr/local/sbin/rcp-bootstrap"
        owner       = "root:root"
        permissions = "0700"
        content     = file("${path.module}/scripts/bootstrap.sh")
      },
      {
        path        = "/usr/local/sbin/rcp-firewall"
        owner       = "root:root"
        permissions = "0700"
        content     = file("${path.module}/scripts/firewall.sh.tftpl")
      },
      {
        path        = "/etc/systemd/system/rcp-firewall.service"
        owner       = "root:root"
        permissions = "0644"
        content     = file("${path.module}/scripts/rcp-firewall.service")
      }
    ]
    runcmd = [["/usr/local/sbin/rcp-bootstrap"]]
  }
}
