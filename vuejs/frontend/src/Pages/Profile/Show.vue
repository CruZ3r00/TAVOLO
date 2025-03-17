<script setup>
import DeleteUserForm from '@/Pages/Profile/Partials/DeleteUserForm.vue';
import SectionBorder from '@/Components/SectionBorder.vue';
import TwoFactorAuthenticationForm from '@/Pages/Profile/Partials/TwoFactorAuthenticationForm.vue';
import UpdatePasswordForm from '@/Pages/Profile/Partials/UpdatePasswordForm.vue';
import UpdateProfileInformationForm from '@/Pages/Profile/Partials/UpdateProfileInformationForm.vue';
import AppLayout from '@/Layouts/AppLayout.vue';
import Footer from '@/components/Footer.vue';

defineProps({
    confirmsTwoFactorAuthentication: Boolean,
    sessions: Array,
});

</script>

<template>

    <AppLayout>

        <section class=" py-5"> 
            
            <div class="bg-white position-relative">
                <div>
                    <UpdateProfileInformationForm :user="$page.props.auth.user" />
                    <SectionBorder />

                    <UpdatePasswordForm/>
                    <SectionBorder />
                
                    <TwoFactorAuthenticationForm :requires-confirmation="confirmsTwoFactorAuthentication"/>
                    <SectionBorder />


                    <template>
                        <SectionBorder />

                        <DeleteUserForm />
                    </template>
                </div>
            </div>
        </section>
        <div class="position-relative" style="z-index: 2;">
            <Footer />
        </div> 
    </AppLayout>
</template>
