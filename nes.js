/* Encapsulates the entire nes console including CPU, Memory Configuration
 * and Picture Processing Unit
 */

function NES() {
    this.cpu = new CPU();
    this.cpu.connect_memory_map(new NESMemoryConfiguration());
    this.cpu.memory.connect_ppu(new NESPPU());
}

/* Initialize data structures to do with the NES */
NES.init = function() {
    CPU.init();
    NESPPU.init();
}

/* takes an array of numbers representing the bytes in the .nes
 * ROM file */
NES.prototype.load_rom = function(data_arr) {
    this.data_arr = data_arr;
    /* parse the nes header */
    this.header = get_header(data_arr);
    console.debug(this.header);
    if (!this.header.valid) {
        return false;
    }

    /* copy each rom bank into its own array */
    this.rom = get_rom_banks(this.header, data_arr);

    /* connect the memory mapper */
    this.cpu.memory.connect_mapper(new Mapper.types[this.header.rom_mapper_type](this.rom));

    /* copy each chr rom bank into its own array */
    this.chrrom = get_chrrom_banks(this.header, data_arr);

    /* connect the chrrom or chrram on the cardridge to the emulated ppu */
    this.cpu.memory.ppu.connect_cartridge_memory(this.chrrom);

    /* set the mirroring used by this game on the ppu */
    this.cpu.memory.ppu.set_mirroring(this.header.mirroring);

    return true;
}

NES.prototype.init = function() {
    this.cpu.init();
}

NES.prototype.start = function() {
    this.cpu.memory.ppu.stabalize(400);
    this.cpu.start();
}

NES.prototype.step = function() {
    this.cpu.step();
}

NES.prototype.test = function() {
    this.cpu.run(40);
    this.cpu.memory.ppu.set_status_bit_7();
    this.cpu.run(40);
    this.cpu.memory.ppu.set_status_bit_7();
    this.cpu.run(120000);

    for (var j = 0;j<5;j++) {
        console.debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Sending interrupt");
        buffer_instr("----------------------------[ INTERRUPT ]---------------------\n");
        this.cpu.interrupts[CPU.NMI] = true;
        for (var i = 0;i< 1; i++) {
            if (!this.cpu.run(100000)) {
                break;
            }
        }
    }

    print_buffer();
//    NESPPU.debug_display_pattern_tables(debug_display.ctx, this.cpu.memory.ppu.vram);
//    this.cpu.memory.ppu.debug_display_pattern_tables(debug_display.ctx);
}

NES.prototype.run = function() {
    this.cpu.run(40);
    this.cpu.memory.ppu.set_status_bit_7();
    this.cpu.run(40);
    this.cpu.memory.ppu.set_status_bit_7();
    var cpu = this.cpu;
    var timer = new Timer(100);
    var cpu_cycle = new TimedEvent(function() {
        if(!cpu.run(1)) {
            timer.running = false;
        }
    }, 1000000);

    var debug_cycle = new TimedEvent(function() {
        print_buffer();
    }, 1);

    timer.add_event(cpu_cycle);
    timer.add_event(debug_cycle);
//    timer.add_event(ppu_cycle);

    timer.run_interleaved();

    this.stop = function() {timer.running = false};
}
