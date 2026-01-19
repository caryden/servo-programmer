# USB Logic Analyzers for Servo Protocol Reverse Engineering

> **PURCHASED:** Saleae Logic 8 (Red) - 8-Channel Logic Analyzer
> - See `tools/saleae_capture.py` for automated capture scripts
> - Install: `pip install logic2-automation`

---

This guide evaluates USB logic analyzers suitable for capturing and analyzing the serial protocol between the Axon Programmer MK2 and Axon servos. Key requirements:

- **Python/scripting support** for automated measurements and analysis
- **Async serial decoding** (UART) at various baud rates (9600 - 1Mbps)
- **Sufficient sample rate** for accurate signal capture
- **Compatibility** with existing tools (`analyze_capture.py`, `serial_monitor.py`)

---

## Quick Recommendation

| Use Case | Recommendation | Price |
|----------|---------------|-------|
| **Best Overall** | Saleae Logic 8 | $499 |
| **Best Value** | DSLogic Plus | ~$100-150 |
| **Tightest Budget** | Raspberry Pi Pico + sigrok-pico | ~$10 |
| **Most Flexible** | Analog Discovery 3 | $379 |

---

## Premium Tier ($400+)

### Saleae Logic 8

**The gold standard for logic analyzers with excellent Python automation support.**

| Specification | Value |
|--------------|-------|
| Channels | 8 digital |
| Sample Rate | 100 MS/s (digital) |
| Logic Levels | 1.8V - 5V |
| Memory | Streaming to PC |
| Interface | USB 2.0 |

**Price:** $499 USD

**Where to Buy:**
- [Saleae Direct](https://www.saleae.com/collections/logic-analyzers) - Ships from Texas, 3-year warranty
- [Amazon - Logic Pro 8 (Black)](https://www.amazon.com/Logic-Pro-Black-Ultra-Portable-Frustration/dp/B074TNNGS8)

**Python Automation:**
```python
from saleae import automation

# Connect to Logic 2 software (must be running with automation enabled)
with automation.Manager.connect(port=10430) as manager:
    device_configuration = automation.LogicDeviceConfiguration(
        enabled_digital_channels=[0, 1],
        digital_sample_rate=10_000_000,
        digital_threshold_volts=3.3,
    )
    capture_configuration = automation.CaptureConfiguration(
        capture_mode=automation.TimedCaptureMode(duration_seconds=5.0)
    )

    capture = manager.start_capture(
        device_configuration=device_configuration,
        capture_configuration=capture_configuration
    )
    capture.wait()

    # Add UART analyzer
    uart_analyzer = capture.add_analyzer('Async Serial',
        label='Servo UART',
        settings={'Input Channel': 0, 'Bit Rate (Bits/s)': 115200}
    )

    # Export decoded data
    capture.export_data_table(
        filepath='/tmp/uart_data.csv',
        analyzers=[uart_analyzer]
    )
```

**Pros:**
- Official Python API (Logic 2 Automation)
- Excellent protocol decoders
- Best-in-class software (Logic 2)
- 3-year warranty covering any malfunction
- 180-day return policy

**Cons:**
- Most expensive option
- Requires Logic 2 software running for automation

**Resources:**
- [Logic 2 Automation API Documentation](https://saleae.github.io/logic2-automation/)
- [UART Automation Example (Gist)](https://gist.github.com/bergkvist/13f8623812256313374c3d5bff0b9f5a)
- [PyPI Package: saleae](https://pypi.org/project/saleae/)

---

### Saleae Logic Pro 8 / Pro 16

**Higher-end models with analog capability and faster sampling.**

| Model | Channels | Digital Rate | Analog Rate | Price |
|-------|----------|-------------|-------------|-------|
| Logic Pro 8 | 8 | 500 MS/s | 50 MS/s | $999 |
| Logic Pro 16 | 16 | 500 MS/s | 50 MS/s | $1,499 |

**Where to Buy:**
- [Saleae Logic Pro 8](https://saleae.com/products/logic-pro-8)
- [Amazon - Logic Pro 8](https://www.amazon.com/Logic-Pro-Black-Ultra-Portable-Frustration/dp/B074TNNGS8)

**Same Python API as Logic 8.** Overkill for servo protocol reverse engineering but valuable if you need analog capture or very high-speed signals.

---

### Digilent Analog Discovery 3

**Versatile instrument combining oscilloscope, logic analyzer, and signal generator.**

| Specification | Value |
|--------------|-------|
| Digital Channels | 16 |
| Digital Sample Rate | 125 MS/s |
| Analog Channels | 2 (oscilloscope) |
| Waveform Generator | 2 channels |
| Logic Levels | 3.3V CMOS |
| Sample Memory | 32,768 samples/channel |

**Price:** $379 USD (retail), $249 USD (academic)

**Where to Buy:**
- [Digilent Shop](https://digilent.com/shop/analog-discovery-3/)
- [Amazon - Analog Discovery 3](https://www.amazon.com/analog-discovery-3/s?k=analog+discovery+3)
- [Amazon - Analog Discovery 2 Bundle](https://www.amazon.com/Digilent-Ultimate-Analog-Discovery-Bundle/dp/B07QZ3JVKT)

**Python Automation (using pydwf):**
```python
# Install: pip install pydwf
from pydwf import DwfLibrary, DwfDevice
from pydwf.utilities import openDwfDevice

dwf = DwfLibrary()

with openDwfDevice(dwf) as device:
    logic = device.digitalIn

    # Configure acquisition
    logic.reset()
    logic.dividerSet(100)  # Set sample rate divider
    logic.sampleFormatSet(16)  # 16-bit samples

    # Configure trigger
    logic.triggerSourceSet(DwfTriggerSourceDetectorDigitalIn)

    # Start acquisition
    logic.configure(reconfigure=False, start=True)

    # Wait and read samples
    while logic.status(readData=False) != DwfStateTriggered:
        pass

    samples = logic.statusData(4096)
```

**Alternative Python wrappers:**
- [pydwf (PyPI)](https://pypi.org/project/pydwf/) - Recommended, well-documented
- [dwfpy (PyPI)](https://pypi.org/project/dwfpy/) - High-level API
- [GitHub: amuramatsu/dwf](https://github.com/amuramatsu/dwf)

**Pros:**
- Oscilloscope + Logic Analyzer in one
- Pattern generator for testing
- Multiple official Python libraries
- Academic pricing available
- Free WaveForms software

**Cons:**
- Only 3.3V logic levels (need level shifter for 5V)
- Limited sample memory
- More complex than pure logic analyzer

**Resources:**
- [WaveForms SDK Getting Started](https://digilent.com/reference/test-and-measurement/guides/waveforms-sdk-getting-started)
- [GitHub: Digilent WaveForms SDK Python Examples](https://github.com/Digilent/WaveForms-SDK-Getting-Started-PY)

---

### Digilent Digital Discovery

**Dedicated high-speed logic analyzer with pattern generator.**

| Specification | Value |
|--------------|-------|
| Digital Channels | 32 |
| Sample Rate | 800 MS/s (8ch), 400 MS/s (16ch), 200 MS/s (32ch) |
| Logic Levels | 1.2V - 3.3V CMOS |
| Pattern Generator | 16 channels @ 100 MS/s |

**Price:** ~$250-300 USD

**Where to Buy:**
- [Digilent Shop](https://digilent.com/shop/digital-discovery-portable-usb-logic-analyzer-and-digital-pattern-generator/)
- [Amazon - Digital Discovery](https://www.amazon.com/Digital-Discovery-Portable-Analyzer-Generator/dp/B076PPCPTR)
- [DigiKey](https://www.digikey.com/en/ptm/d/digilent/digital-discovery)

**Same Python API as Analog Discovery (WaveForms SDK).**

**Pros:**
- Highest sample rate in this price range
- 32 channels
- Pattern generator for protocol simulation

**Cons:**
- 3.3V max logic level
- High-speed adapter sold separately for max sample rates

---

## Mid-Range Tier ($100-400)

### DSLogic U3Pro16

**High-performance USB 3.0 logic analyzer with good sigrok support.**

| Specification | Value |
|--------------|-------|
| Channels | 16 |
| Sample Rate (Buffer) | 1 GHz (8ch), 500 MHz (16ch) |
| Sample Rate (Stream) | 125 MHz (16ch) |
| Memory | 2 Gbit |
| Interface | USB 3.0 Type-C |

**Price:** ~$299 USD

**Where to Buy:**
- [Amazon - DSLogic U3Pro16](https://www.amazon.com/DreamSourceLab-DSLogic-USB-Based-Logic-Analyzer/dp/B08C2C2RQH)
- [DreamSourceLab Shop](https://www.dreamsourcelab.com/shop/logic-analyzer/dslogic-u3pro16/)
- [Seeed Studio](https://www.seeedstudio.com/DSLogic-U3Pro16-1Ghz-Sampling-16-Channel-USB3-0-Portable-Logic-Sniffer-p-4518.html)

**Python Automation (via sigrok-cli):**
```python
import subprocess
import json

def capture_dslogic(channels=[0,1], sample_rate='1m', samples=10000):
    """Capture data from DSLogic using sigrok-cli"""
    channel_str = ','.join(map(str, channels))
    cmd = [
        'sigrok-cli',
        '--driver=dreamsourcelab-dslogic',
        f'-C', channel_str,
        '-c', f'samplerate={sample_rate}:voltage_threshold=2.5-2.5',
        f'--samples={samples}',
        '-O', 'csv'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout

def decode_uart(capture_file, baud_rate=115200):
    """Decode UART protocol from capture"""
    cmd = [
        'sigrok-cli',
        '-i', capture_file,
        '-P', f'uart:baudrate={baud_rate}:rx=0',
        '-A', 'uart=rx-data'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout
```

**Pros:**
- Excellent sample rate for the price
- USB 3.0 for faster data transfer
- Large sample memory
- sigrok compatible

**Cons:**
- Requires firmware extraction for sigrok
- Native DSView software is less polished than Saleae

**Resources:**
- [sigrok wiki: DSLogic](https://sigrok.org/wiki/DreamSourceLab_DSLogic)
- [Firmware extraction script](https://sigrok.org/wiki/DreamSourceLab_DSLogic#Firmware)

---

### DSLogic Plus

**Best value mid-range option with excellent capabilities.**

| Specification | Value |
|--------------|-------|
| Channels | 16 |
| Sample Rate (Buffer) | 400 MHz |
| Sample Rate (Stream) | 100 MHz |
| Memory | 256 Mbit |
| Interface | USB 2.0 Type-C |

**Price:** ~$100-150 USD

**Where to Buy:**
- [Amazon - DSLogic Plus (various sellers)](https://www.amazon.com/Analyzer-Channels-Sampling-256Mbits-Interface/dp/B0CLRS7PY9)
- [Amazon - Generic DSLogic Plus](https://www.amazon.com/Generic-Analyzer-Bandwidth-Sampling-Debugging/dp/B0D3WSKD8X)
- [DreamSourceLab Shop](https://www.dreamsourcelab.com/shop/logic-analyzer/dslogic-plus/)

**Same Python/sigrok integration as U3Pro16.**

**Pros:**
- Great price/performance ratio
- Stream + Buffer modes
- sigrok compatible
- Portable metal case

**Cons:**
- USB 2.0 limits streaming bandwidth
- Requires sigrok firmware extraction

---

### Kingst LA2016

**Popular mid-range analyzer with dedicated Python library.**

| Specification | Value |
|--------------|-------|
| Channels | 16 |
| Sample Rate | 200 MHz |
| Memory | 128 MiB |
| Interface | USB 2.0 |

**Price:** ~$100-125 USD

**Where to Buy:**
- [Amazon - innomaker LA2016](https://www.amazon.com/LA2016-Analyzer-Channels-Sampling-Instrument/dp/B07D35FNYL)
- [AliExpress](https://www.aliexpress.com/item/32774674162.html)
- [Kingst Official](https://www.qdkingst.com/en/products/LA2016)

**Python Automation (using PyLogicKingst):**
```python
# For LA1010 (similar for LA2016 via sigrok)
# https://github.com/maro7tigre/PyLogicKingst
from pylogickingst import LA1010

analyzer = LA1010()
analyzer.connect()

# Configure capture
analyzer.set_sample_rate(10_000_000)
analyzer.set_channels([0, 1])

# Capture
data = analyzer.capture(num_samples=10000)

# Decode with sigrok decoders
decoded = analyzer.decode('uart', {'baudrate': 115200, 'rx': 0})
```

**Sigrok-cli method:**
```bash
# Capture with sigrok-cli
sigrok-cli --driver=kingst-la2016 -C 0,1 -c samplerate=1m --samples 10000 -O csv
```

**Pros:**
- Good sample rate
- Dedicated Python library (PyLogicKingst)
- sigrok compatible
- Affordable

**Cons:**
- Firmware extraction needed for sigrok
- Vendor software (KingstVIS) is Windows-focused

**Resources:**
- [sigrok wiki: Kingst LA Series](https://sigrok.org/wiki/Kingst_LA_Series)
- [GitHub: PyLogicKingst](https://github.com/maro7tigre/PyLogicKingst)

---

## Budget Tier (Under $50)

### SparkFun USB Logic Analyzer

**Quality budget option with sigrok support.**

| Specification | Value |
|--------------|-------|
| Channels | 8 |
| Sample Rate | 24 MHz |
| Logic Levels | 2.0V - 5.25V |
| Interface | USB 2.0 Mini-B |

**Price:** ~$16-20 USD

**Where to Buy:**
- [Amazon - SparkFun USB Logic Analyzer](https://www.amazon.com/SparkFun-PID-15033-Logic-Analyzer/dp/B07JPKYGPZ)
- [SparkFun Direct](https://www.sparkfun.com/products/15033)

**Python via sigrok-cli:**
```python
import subprocess

def capture_fx2(channels='0,1', sample_rate='12m', samples=10000):
    cmd = [
        'sigrok-cli',
        '--driver=fx2lafw',
        f'-C', channels,
        '-c', f'samplerate={sample_rate}',
        f'--samples={samples}',
        '-O', 'csv'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout
```

**Pros:**
- Very affordable
- Works out of the box with sigrok
- 5V tolerant
- No firmware extraction needed

**Cons:**
- 24 MHz max sample rate (sufficient for most UART up to ~2.4 Mbps)
- Basic feature set

**Resources:**
- [SparkFun Tutorial: Using with sigrok PulseView](https://learn.sparkfun.com/tutorials/using-the-usb-logic-analyzer-with-sigrok-pulseview/all)
- [sigrok wiki: fx2lafw](https://sigrok.org/wiki/Fx2lafw)

---

### Generic FX2-Based Logic Analyzers

**Ultra-cheap Cypress FX2 clones.**

| Specification | Value |
|--------------|-------|
| Channels | 8 |
| Sample Rate | 24 MHz |
| Logic Levels | ~2V - 5.5V |
| Interface | USB 2.0 |

**Price:** ~$8-15 USD

**Where to Buy:**
- Search Amazon for "24MHz 8-channel logic analyzer"
- [Amazon - HiLetgo Logic Analyzer](https://www.amazon.com/s?k=HiLetgo+logic+analyzer)
- [Amazon - KeeYees Logic Analyzer](https://www.amazon.com/s?k=KeeYees+logic+analyzer)
- AliExpress (even cheaper)

**Same Python/sigrok integration as SparkFun.**

**Pros:**
- Cheapest option
- Works with sigrok fx2lafw driver
- Good enough for basic serial debugging

**Cons:**
- Variable quality control
- No warranty
- Basic probes

---

### Raspberry Pi Pico (DIY)

**Convert a $4 microcontroller into a logic analyzer.**

| Specification | Value |
|--------------|-------|
| Channels | Up to 21 |
| Sample Rate | Up to 120 MHz (PIO) |
| Logic Levels | 3.3V (5V tolerant on some pins) |
| Interface | USB 1.1 |

**Price:** ~$4-10 USD (Pico + USB cable)

**Where to Buy:**
- [Amazon - Raspberry Pi Pico](https://www.amazon.com/s?k=raspberry+pi+pico)
- [Adafruit](https://www.adafruit.com/product/4864)
- [SparkFun](https://www.sparkfun.com/products/17829)

**Setup:**
1. Flash sigrok-pico firmware: [GitHub: pico-coder/sigrok-pico](https://github.com/pico-coder/sigrok-pico)
2. Use with PulseView or sigrok-cli

**Python via sigrok-cli:**
```python
import subprocess

def capture_pico(channels='0,1', sample_rate='10m', samples=10000):
    cmd = [
        'sigrok-cli',
        '--driver=raspberrypi-pico',
        f'-C', channels,
        '-c', f'samplerate={sample_rate}',
        f'--samples={samples}',
        '-O', 'csv'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout
```

**Alternative: pysigrok (pure Python):**
```python
# https://github.com/pysigrok
from pysigrok import Session
from pysigrok.hardware.raspberrypi_pico import RaspberryPiPico

session = Session()
device = RaspberryPiPico()
session.add_device(device)

device.configure(sample_rate=10_000_000, channels=[0, 1])
data = device.capture(num_samples=10000)
```

**Pros:**
- Incredibly cheap
- Surprisingly capable (120 MHz via PIO)
- Native sigrok support (merged mainline)
- Educational/hackable

**Cons:**
- 3.3V only (need level shifter for 5V)
- Limited USB bandwidth
- DIY setup required
- Less reliable than dedicated hardware

**Resources:**
- [GitHub: sigrok-pico](https://github.com/pico-coder/sigrok-pico)
- [GitHub: pysigrok](https://github.com/pysigrok)
- [GitHub: rp2040-logic-analyzer](https://github.com/gamblor21/rp2040-logic-analyzer)
- [Hackaday: μLA Micro Logic Analyzer](https://hackaday.io/project/190583-la-micro-logic-analyzer-for-rp2040)

---

## Sigrok Integration Guide

Most mid-range and budget analyzers work with sigrok, providing a unified Python scripting approach.

### Installing sigrok

```bash
# macOS
brew install sigrok-cli pulseview

# Ubuntu/Debian
sudo apt install sigrok sigrok-cli pulseview

# Windows
# Download from https://sigrok.org/wiki/Downloads
```

### Python Integration Patterns

**Pattern 1: subprocess with sigrok-cli (Simplest)**
```python
import subprocess
import csv
from io import StringIO

def capture_and_decode(driver, channels, sample_rate, samples, uart_baud):
    # Capture raw data
    capture_cmd = [
        'sigrok-cli',
        f'--driver={driver}',
        '-C', channels,
        '-c', f'samplerate={sample_rate}',
        f'--samples={samples}',
        '-o', '/tmp/capture.sr'
    ]
    subprocess.run(capture_cmd, check=True)

    # Decode UART
    decode_cmd = [
        'sigrok-cli',
        '-i', '/tmp/capture.sr',
        '-P', f'uart:baudrate={uart_baud}:rx=0',
        '-A', 'uart=rx-data',
        '-O', 'csv'
    ]
    result = subprocess.run(decode_cmd, capture_output=True, text=True)

    # Parse results
    reader = csv.reader(StringIO(result.stdout))
    return list(reader)
```

**Pattern 2: libsigrok Python bindings (Advanced)**
```python
# Requires building libsigrok with Python bindings
# https://sigrok.org/wiki/Libsigrok
import sigrok.core as sr

context = sr.Context.create()
session = context.create_session()

# Find device
drivers = context.drivers
driver = drivers['fx2lafw']
devices = driver.scan()
device = devices[0]

# Configure
device.config_set(sr.ConfigKey.SAMPLERATE, 10000000)

# Capture
session.add_device(device)
session.start()
# ... handle data ...
session.stop()
```

**Pattern 3: Managing sigrok-cli data with Python**
```python
# From sigrok wiki: Managing_sigrok-cli_data_with_Python
import subprocess
import numpy as np

def get_samples(driver, samplerate, num_samples):
    cmd = [
        'sigrok-cli',
        f'--driver={driver}',
        '-c', f'samplerate={samplerate}',
        f'--samples={num_samples}',
        '-O', 'binary'
    ]
    result = subprocess.run(cmd, capture_output=True)
    return np.frombuffer(result.stdout, dtype=np.uint8)
```

### Resources

- [sigrok wiki: Managing sigrok-cli data with Python](https://sigrok.org/wiki/Managing_sigrok-cli_data_with_Python)
- [GitHub: sigrok-python-example](https://github.com/karlp/sigrok-python-example)
- [sigrok Python bindings API Reference](https://www.sigrok.org/api/libsigrok/0.5.1/bindings/python/)

---

## Integration with Project Tools

### Using with analyze_capture.py

The existing `tools/analyze_capture.py` can process hex dumps and Wireshark JSON exports. Logic analyzer captures can be converted:

```python
# Export from sigrok-cli to format compatible with analyze_capture.py
import subprocess

def capture_to_hex_dump(driver, channels, sample_rate, samples, output_file):
    # Capture with UART decoder
    cmd = [
        'sigrok-cli',
        f'--driver={driver}',
        '-C', channels,
        '-c', f'samplerate={sample_rate}',
        f'--samples={samples}',
        '-P', 'uart:baudrate=115200:rx=0:tx=1',
        '-A', 'uart'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)

    # Convert to hex dump format expected by analyze_capture.py
    with open(output_file, 'w') as f:
        for line in result.stdout.strip().split('\n'):
            if 'RX:' in line:
                # Extract hex value
                hex_val = line.split(':')[-1].strip()
                f.write(f"RX: {hex_val}\n")
            elif 'TX:' in line:
                hex_val = line.split(':')[-1].strip()
                f.write(f"TX: {hex_val}\n")
```

### Using with serial_monitor.py

For real-time monitoring, use the logic analyzer to verify serial_monitor.py findings:

```bash
# Capture while running serial_monitor.py
sigrok-cli --driver=fx2lafw -C 0,1 -c samplerate=1m --continuous -O csv | \
    python -c "import sys; [print(line) for line in sys.stdin]"
```

---

## Comparison Matrix

| Analyzer | Price | Sample Rate | Channels | Python API | sigrok | Best For |
|----------|-------|-------------|----------|------------|--------|----------|
| **Saleae Logic 8** | $499 | 100 MS/s | 8 | Native | No | Professional use |
| **Saleae Logic Pro 8** | $999 | 500 MS/s | 8 | Native | No | High-speed + analog |
| **Analog Discovery 3** | $379 | 125 MS/s | 16 | Native (pydwf) | No | Multi-instrument |
| **Digital Discovery** | ~$280 | 800 MS/s | 32 | Native (pydwf) | No | High-speed digital |
| **DSLogic U3Pro16** | $299 | 1 GHz | 16 | sigrok-cli | Yes | High performance |
| **DSLogic Plus** | ~$130 | 400 MHz | 16 | sigrok-cli | Yes | Best mid-range value |
| **Kingst LA2016** | ~$115 | 200 MHz | 16 | PyLogicKingst | Yes | Budget professional |
| **SparkFun FX2** | ~$18 | 24 MHz | 8 | sigrok-cli | Yes | Budget sigrok |
| **Generic FX2** | ~$10 | 24 MHz | 8 | sigrok-cli | Yes | Cheapest option |
| **Pico + sigrok** | ~$6 | 120 MHz | 21 | pysigrok | Yes | DIY/educational |

---

## Recommendations for This Project

### Primary Recommendation: DSLogic Plus (~$130)

For reverse engineering the Axon servo protocol, the **DSLogic Plus** offers the best balance:

1. **Sufficient specs**: 400 MHz sample rate is overkill for serial protocols (even 1 Mbps UART)
2. **sigrok compatible**: Works with Python via sigrok-cli subprocess calls
3. **Good value**: Mid-range price with near-professional features
4. **Portable**: Metal case, USB-C

### Budget Alternative: SparkFun USB Logic Analyzer (~$18)

If budget is constrained, the SparkFun works perfectly for:
- UART up to ~2 Mbps (24 MHz gives 12x oversampling at 2 Mbps)
- Full sigrok/PulseView compatibility
- Immediate plug-and-play with fx2lafw

### Premium Alternative: Saleae Logic 8 ($499)

If budget allows and you want the best experience:
- Official Python automation API
- Best software in the industry
- 3-year warranty
- Most documentation and examples

---

## Additional Resources

### Software
- [PulseView (sigrok GUI)](https://sigrok.org/wiki/PulseView)
- [Saleae Logic 2](https://www.saleae.com/downloads/)
- [Digilent WaveForms](https://digilent.com/shop/software/digilent-waveforms/)
- [DSView](https://www.dreamsourcelab.com/download/)

### Documentation
- [sigrok Protocol Decoders](https://sigrok.org/wiki/Protocol_decoders)
- [Saleae UART Tutorial](https://support.saleae.com/tutorials/example-projects/how-to-analyze-uart)
- [sigrok Logic Analyzer Comparison](https://sigrok.org/wiki/Logic_analyzer_comparison)

### Python Libraries
- [saleae (PyPI)](https://pypi.org/project/saleae/) - Saleae Logic 2 automation
- [pydwf (PyPI)](https://pypi.org/project/pydwf/) - Digilent WaveForms
- [dwfpy (PyPI)](https://pypi.org/project/dwfpy/) - Digilent WaveForms (high-level)
- [PyLogicKingst (GitHub)](https://github.com/maro7tigre/PyLogicKingst) - Kingst LA series
