/* Here is where all the instruction emulation is implemented */
function Emulator(){}

Emulator.init = function() {
    with (AddressingMode) {

        /* This array will hold functions emulating the getting of data
         * for the various addressing modes. These will be called with
         * "this" refering to a machine. */
        AddressingMode.read_data = [];
        var r = AddressingMode.read_data;
        r[IMM] = function() {
            /* Immediate:
             * The byte following the instruction contains
             * the data.
             */
            return this.memory.read(this.pc++);
        }
        r[ABS] = function() {
            /* Absolute:
             * The two bytes following the instruction represent
             * a little endian address. Read the byte at that
             * address.
             */
            var addr = this.little_endian_2_byte_at(this.pc);
            this.pc += 2;
            return this.memory.read(addr);
        }
        r[REL] = function() {
            /* Relative:
             * 2's complement add the 1 byte following the instruction
             * to the PC (don't set the PC to this value, just return it).
             */
            var offset = this.memory.read(this.pc++);
            return twos_complement_8(offset) + this.pc;
        }

        r[ACC] = function() {
            /* Accumulator:
             * The value comes from the accumulator
             */
            return this.ac;
        }

        r[ZP] = function() {
            /* Zero Page:
             * The single byte pointed to by the pc is the low byte
             * of the address in zero page (so the high byte is 0).
             */
            var addr = this.memory.read(this.pc++);
            return this.memory.read(addr);
        }

        r[ZP_X] = function() {
            /* Zero Page indexed by X:
             * The given address is added to the value in X and the
             * result desired address.
             */
            var addr = this.memory.read(this.pc++) + this.x;
            return this.memory.read(addr);
        }

        r[ZP_I_X] = function(data) {
            /* Zero Page indirect indexed by X:
             * The byte following the instruction is the low byte of an address in
             * the zero page (so the high byte is zero).
             * At this address there is the low byte of a second address.
             * The high byte of this address is stored in the following byte. This
             * is the relevant address for the instruction.
             */
            var i_addr = this.memory.read(this.pc++); // indirect address
            var addr = this.little_endian_2_byte_at(i_addr) + this.x;
            return this.memory.read(addr);
        }



        /* This array will hold functions emulating storing data
         * in memory. */
        AddressingMode.write_data = [];
        var w = AddressingMode.write_data;
        w[ABS] = function(data) {
            /* Absolute:
             * The two bytes following the instruction represent
             * a little endian address. Store the data there.
             */
            var addr = this.little_endian_2_byte_at(this.pc);
            this.pc += 2;
            this.memory.write(addr, data);
        }

        w[ACC] = function(data) {
            /* Accumulator:
             * Store the value in the accumulator.
             */
            this.ac = data;
        }

        w[ZP] = function(data) {
            /* Zero Page:
             * The single byte pointed to by the pc is the low byte
             * of the address in zero page (so the high byte is 0).
             */
            var addr = this.memory.read(this.pc++);
            this.memory.write(addr, data);
        }

        w[ZP_Y] = function(data) {
            /* Zero Page indexed by Y:
             * The given address is added to the value in Y and the
             * result desired address.
             */
            var addr = this.memory.read(this.pc++) + this.y;
            this.memory.write(addr, data);
        }

        w[ZP_I_Y] = function(data) {
            /* Zero Page indirect indexed by Y:
             * The byte following the instruction is the low byte of an address in
             * the zero page (so the high byte is zero).
             * At this address there is the low byte of a second address.
             * The high byte of this address is stored in the following byte. This
             * is the relevant address for the instruction.
             */
            var i_addr = this.memory.read(this.pc++); // indirect address
            var addr = this.little_endian_2_byte_at(i_addr) + this.y;
            this.memory.write(addr, data);
        }

        /* This array will hold functions emulating getting an
         * address following an instruction. */
        AddressingMode.read_address = [];
        var a = AddressingMode.read_address;
        a[ABS] = function() {
            /* Absolute:
             * The address is literally stored after the current
             * instruction in little endian format
             */
            return this.little_endian_2_byte_at(this.pc);
        }
    }

    with (Instruction) {
        /* This array will hold functions emulating the execution
         * of various instructions. These will be called with
         * "this" refering to a machine. Each function takes an
         * argument "am" which contains the addressing mode. */
        Instruction.emulate = [];
        var e = Instruction.emulate;
        e[LDA] = function(am) {
            /* LDA: Load Accumulator
             * Stores a value in the accumulator
             */
            this.ac = r[am].call(this);
            this.sr_respond(this.ac);
        }

        e[SEI] = function(am) {
            /* SEI: Set Interrupt-disable bit in SR */
            this.sr |= 1<<CPU.SR_INTERRUPT_DISABLE;
        }

        e[CLD] = function(am) {
            /* CLD: Clear the Decimal-mode bit in SR */
            this.sr &= (~(1<<CPU.SR_DECIMAL));
        }

        e[STA] = function(am) {
            /* STA: Store the Accumulator in memory */
            w[am].call(this, this.ac);
        }

        e[LDX] = function(am) {
            /* LDX: Load a value into X */
            this.x = r[am].call(this);
            this.sr_respond(this.x);
        }

        e[TXS] = function(am) {
            /* TXS: Transfer the value in X to SR */
            this.sp = this.x;
            this.sr_respond(this.sp);
        }

        e[AND] = function(am) {
            /* AND: Bitwise and the accumulator with a value
             * and store the result in the accumulator
             */
            this.ac &= r[am].call(this);
            this.sr_respond(this.ac);
        }

        e[BEQ] = function(am) {
            /* BEQ: Jump to the relative address if the zero
             * bit of SR is set
             */
            var addr = r[am].call(this);
            if (this.sr & 1<<CPU.SR_ZERO) {
                this.pc = addr;
            }
        }

        e[ORA] = function(am) {
            /* ORA: Bitwise or the accumulator with a value
             * and store the result in the accumulator
             */
            this.ac |= r[am].call(this);
            this.sr_respond(this.ac);
        }

        e[JSR] = function(am) {
            /* JSR: Jump Subroutine
             * Only works in absolute mode (ABS).
             * 1. Push the first address after the 2 byte argument onto the stack
             * 2. Set the PC to be the little endian address following the JSR instruction
             */

            /* the pc points the the first byte after the JSR instruction so
             * it's fine to just do this */
            var addr = a[am].call(this);

            /* pc now points to the byte after the JSR instruction
             * We're supposed to push the address
             * of the last byte of the JSR instruction, so we need to increase
             * the PC by 1 */
            this.pc++;
            this.stack_push(this.get_pch()); // push high byte first
            this.stack_push(this.get_pcl()); // push low byte
            this.pc = addr;
        }

        e[LSR] = function(am) {
            /* LSR: Logical Shift Right by 1
             * Shift either the accumulator or a byte in memory
             * one to the right, padding the most significant byte
             * with a 0.
             */
            var value = r[am].call(this);

            // set the carry flag in the sr to the lsb of the value
            this.sr |= ((value & 1) << CPU.SR_CARRY);

            // the negative flag is always reset
            this.sr_clear(CPU.SR_NEGATIVE);

            // shift the value 1 to the right
            value >>= 1;

            // set the zero bit if necessary
            if (value == 0) {
                this.sr_set(CPU.SR_ZERO);
            } else {
                this.sr_clear(CPU.SR_ZERO);
            }

            // write out the new value
            w[am].call(this, value);
        }

        e[RTS] = function(am) {
            /* RTS: Return from Subroutine
             * Get the pc off the stack (little endian),
             * increment it, and change the pc to its value
             */
            this.set_pcl(this.stack_pull()); // get low byte
            this.set_pch(this.stack_pull()); // get high byte
            this.pc++;
        }

        e[JMP] = function(am) {
            /* JMP: Jump to a new location
             */
            this.pc = a[am].call(this);
        }

        e[CMP] = function(am) {
            /* CMP: Compare memory with accumulator
             * This subtracts the value in memory from the accumulator
             * and adjusts the sr flags as follows (without changing
             * other register).
             */

            var result = this.ac - r[am].call(this);
            this.sr_assign(result & 1<<7, CPU.NEGATIVE);
            this.sr_assign(result == 0, CPU.ZERO);
            this.sr_assign(result >= 0, CPU.SR_CARRY);
        }

        e[BNE] = function(am) {
            /* BEQ: Jump to the relative address if the zero
             * bit of SR is clear
             */
            var addr = r[am].call(this);
            if (!(this.sr & 1<<CPU.SR_ZERO)) {
                this.pc = addr;
            }
        }

        e[LDY] = function(am) {
            /* LDX: Load a value into X */
            this.y = r[am].call(this);
            this.sr_respond(this.y);
        }

        e[CLC] = function(am) {
            /* CLC: Clear Carry Flag */
            this.sr &= (~(1<<CPU.SR_CARRY));
        }

        e[ADC] = function(am) {
            /* ADC: Add value in memory to the accumulator with carry
             */
            this.ac += twos_complement_8(r[am].call(this));
            if (this.sr & 1<<CPU.SR_CARRY) {
                this.ac++;
            }

            /* updated flags:
             * carry is set iff the sum exceeds 255 or a decimal add exceeds 99 */
            this.sr_assign(((this.sr & 1<<CPU.SR_DECIMAL) && (this.ac > 99)) || this.ac > 255, CPU.SR_CARRY);

            /* overflow is set iff the result exceeds 127 or is less than -128 */
            this.sr_assign(this.ac > 127 || this.ac < -128, CPU.SR_OVERFLOW);

            /* it makes sense to crop the result to 1 byte here */
            this.ac = to_twos_complement_8(this.ac);

            /* negavite flag is set if the result has bit 7 set */
            this.sr_assign(this.ac & 1<<7, CPU.SR_NEGATIVE);

            /* zero flag is set if the result is zero */
            this.sr_assign(this.ac == 0, CPU.SR_ZERO);

        }

        e[SEC] = function(am) {
            /* SEC: Set Carry Flag */
            this.sr |= 1<<CPU.SR_CARRY;
        }

        e[DEY] = function(am) {
            /* DEY: Decrement the value in y */
            this.y = to_twos_complement_8(this.y - 1);

            this.sr_assign(this.y == 0, CPU.SR_ZERO);
            this.sr_assign(this.y & 1<<7, CPU.SR_NEGATIVE);
        }

        e[CPY] = function(am) {
            /* CMP: Compare memory with accumulator
             * This subtracts the value in memory from the accumulator
             * and adjusts the sr flags as follows (without changing
             * other register).
             */

            var result = this.ac - r[am].call(this);

            this.sr_assign(result & 1<<7, CPU.NEGATIVE);
            this.sr_assign(result == 0, CPU.ZERO);
            this.sr_assign(result >= 0, CPU.SR_CARRY);
        }

        e[DEC] = function(am) {
            /* DEC: Decrement a value in memory */
            var value = r[am].call(this);
            value = to_twos_complement_8(value - 1);
            w[am].call(this, value);
            this.sr_assign(value == 0, CPU.SR_ZERO);
            this.sr_assign(value & 1<<7, CPU.SR_NEGATIVE);
        }
    }
}
